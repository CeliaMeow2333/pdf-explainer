/** Google Translate lookup + the small popup that shows the result. */

import { copyText, el, icon } from "./dom.js";
import { LANGUAGES, languageLabel } from "./languages.js";

const ENDPOINT = "https://translate.googleapis.com/translate_a/single";

export async function translateText({ text, target, signal }) {
  const query = String(text || "").trim();
  if (!query) {
    throw new Error("Nothing to translate — select some text first.");
  }

  const url =
    `${ENDPOINT}?client=gtx&sl=auto&tl=${encodeURIComponent(target || "en")}` +
    `&dt=t&q=${encodeURIComponent(query)}`;

  let response;
  try {
    response = await fetch(url, { signal, headers: { Accept: "application/json" } });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw error;
    }
    throw new Error("Could not reach Google Translate. Check your connection.");
  }

  if (!response.ok) {
    throw new Error(`Google Translate returned HTTP ${response.status}.`);
  }

  const payload = await response.json().catch(() => null);
  const segments = Array.isArray(payload?.[0]) ? payload[0] : [];
  const translated = segments
    .map((segment) => (Array.isArray(segment) ? segment[0] : ""))
    .filter(Boolean)
    .join("");

  if (!translated) {
    throw new Error("Google Translate did not return any text.");
  }

  return {
    translated,
    sourceLanguage: typeof payload?.[2] === "string" ? payload[2] : "",
  };
}

function detectedLabel(code) {
  if (!code) {
    return "";
  }
  const exact = LANGUAGES.find((language) => language.code.toLowerCase() === code.toLowerCase());
  if (exact) {
    return exact.label;
  }
  const base = code.split("-")[0].toLowerCase();
  const loose = LANGUAGES.find((language) => language.code.split("-")[0].toLowerCase() === base);
  return loose ? loose.label : code;
}

export class TranslatePopup {
  constructor() {
    this.element = null;
    this.controller = null;
    this.visible = false;
    this.onDocumentPointerDown = (event) => {
      if (this.element && !this.element.contains(event.target)) {
        this.hide();
      }
    };
    this.onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        this.hide();
      }
    };
  }

  ensureMounted() {
    if (this.element) {
      return;
    }
    this.titleEl = el("span", { class: "pe-translate-title-text", text: "Google Translate" });
    this.targetEl = el("span", { class: "pe-translate-target" });
    this.bodyEl = el("div", { class: "pe-translate-body" });
    this.metaEl = el("div", { class: "pe-translate-meta" });
    this.currentText = "";

    this.copyButton = el(
      "button",
      {
        class: "pe-icon-btn",
        type: "button",
        title: "Copy translation",
        onclick: () => this.copyTranslation(),
      },
      [icon("copy", { size: 15 })],
    );

    this.element = el(
      "div",
      {
        class: "pe-translate",
        role: "dialog",
        "aria-label": "Translation",
        "aria-live": "polite",
      },
      [
        el("header", { class: "pe-translate-header" }, [
          el("div", { class: "pe-translate-title" }, [
            icon("translate", { size: 15 }),
            this.titleEl,
            this.targetEl,
          ]),
          el("div", { class: "pe-translate-actions" }, [
            this.copyButton,
            el(
              "button",
              {
                class: "pe-icon-btn",
                type: "button",
                title: "Close (Esc)",
                onclick: () => this.hide(),
              },
              [icon("close", { size: 15 })],
            ),
          ]),
        ]),
        this.bodyEl,
        this.metaEl,
      ],
    );
    document.body.append(this.element);
  }

  async copyTranslation() {
    if (!this.currentText) {
      return;
    }
    const copied = await copyText(this.currentText);
    this.copyButton.replaceChildren(icon(copied ? "check" : "copy", { size: 15 }));
    this.copyButton.title = copied ? "Copied" : "Copy translation";
    setTimeout(() => {
      this.copyButton.replaceChildren(icon("copy", { size: 15 }));
      this.copyButton.title = "Copy translation";
    }, 1400);
  }

  /**
   * @param {object} options
   * @param {DOMRect} options.anchorRect selection rectangle in viewport coords
   * @param {string} options.text selected text
   * @param {string} options.target target language code
   */
  async show({ anchorRect, text, target }) {
    this.ensureMounted();
    this.controller?.abort();
    this.controller = new AbortController();

    this.targetEl.textContent = `(${languageLabel(target, { short: true })})`;
    this.bodyEl.replaceChildren(el("div", { class: "pe-typing pe-typing-dark" }, [el("i"), el("i"), el("i")]));
    this.metaEl.textContent = "";
    this.currentText = "";
    this.element.classList.add("pe-open");
    this.visible = true;
    this.position(anchorRect);

    if (!this.listenersAttached) {
      this.listenersAttached = true;
      setTimeout(() => {
        document.addEventListener("pointerdown", this.onDocumentPointerDown, true);
        document.addEventListener("keydown", this.onKeyDown, true);
      }, 0);
    }

    try {
      const { translated, sourceLanguage } = await translateText({
        text,
        target,
        signal: this.controller.signal,
      });
      this.bodyEl.replaceChildren(el("div", { class: "pe-translate-text", text: translated }));
      this.currentText = translated;
      this.metaEl.textContent = sourceLanguage
        ? `Detected: ${detectedLabel(sourceLanguage)}`
        : "";
      this.position(anchorRect);
    } catch (error) {
      if (error?.name === "AbortError") {
        return;
      }
      this.bodyEl.replaceChildren(el("div", { class: "pe-translate-error", text: error.message }));
      this.position(anchorRect);
    }
  }

  position(anchorRect) {
    if (!this.element) {
      return;
    }
    const margin = 12;
    const gap = 10;
    const rect = anchorRect || { top: 80, bottom: 80, left: window.innerWidth / 2, right: window.innerWidth / 2 };

    // Make the popup measurable before placing it.
    this.element.style.visibility = "hidden";
    this.element.style.left = "0px";
    this.element.style.top = "0px";
    const box = this.element.getBoundingClientRect();
    this.element.style.visibility = "";

    let left = Math.min(rect.left, window.innerWidth - box.width - margin);
    left = Math.max(margin, left);

    let top = rect.bottom + gap;
    if (top + box.height > window.innerHeight - margin) {
      const above = rect.top - box.height - gap;
      top = above >= margin ? above : Math.max(margin, window.innerHeight - box.height - margin);
    }

    this.element.style.left = `${Math.round(left)}px`;
    this.element.style.top = `${Math.round(top)}px`;
  }

  hide() {
    this.controller?.abort();
    this.controller = null;
    if (this.element) {
      this.element.classList.remove("pe-open");
    }
    this.visible = false;
    if (this.listenersAttached) {
      this.listenersAttached = false;
      document.removeEventListener("pointerdown", this.onDocumentPointerDown, true);
      document.removeEventListener("keydown", this.onKeyDown, true);
    }
  }
}

let instance = null;

export function getTranslatePopup() {
  if (!instance) {
    instance = new TranslatePopup();
  }
  return instance;
}
