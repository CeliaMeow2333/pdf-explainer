/** Right hand side chat panel used by both AI Explain and AI Answer. */

import { copyText, el, icon, renderMarkdown } from "./dom.js";
import { AIError, buildSystemPrompt, defaultExplainPrompt, streamChat } from "./ai.js";

const COMPOSER_HINTS = {
  zh: "输入你的问题，按 Enter 发送；留空直接询问「解释所选内容」。",
  en: "Ask anything about the selection. Press Enter to send, or leave it empty to ask for an explanation.",
  ja: "選択内容について質問してください。Enter で送信、空欄なら解説を依頼します。",
  ko: "선택한 내용에 대해 질문하세요. Enter로 전송하며, 비워 두면 설명을 요청합니다.",
};

function composerHint(languageCode) {
  const base = String(languageCode || "en").split("-")[0];
  return COMPOSER_HINTS[base] || COMPOSER_HINTS.en;
}

function quoteSummary(quote) {
  const bits = [];
  if (quote.image) {
    bits.push("Image selection");
  }
  if (quote.text) {
    bits.push("Selected text");
  }
  if (quote.pages?.length) {
    bits.push(quote.pages.length === 1 ? `Page ${quote.pages[0]}` : `Pages ${quote.pages.join(", ")}`);
  }
  return bits.join(" · ");
}

export class ChatSidebar {
  constructor({ getSettings }) {
    this.getSettings = getSettings;
    this.messages = [];
    this.pendingQuote = null;
    this.streaming = false;
    this.abortController = null;
    this.mounted = false;
    this.scrollQueued = false;
  }

  mount() {
    if (this.mounted) {
      return;
    }
    this.mounted = true;

    this.closeButton = el(
      "button",
      { class: "pe-icon-btn", title: "Close (Esc)", type: "button", onclick: () => this.close() },
      [icon("close", { size: 16 })],
    );

    this.subtitle = el("div", { class: "pe-sidebar-subtitle", text: "AI assistant" });

    this.messagesEl = el("div", { class: "pe-messages" });

    this.textarea = el("textarea", {
      class: "pe-composer-input",
      rows: "1",
      placeholder: "Ask more…",
      "aria-label": "Ask the AI assistant",
    });
    this.textarea.addEventListener("input", () => this.autoResize());
    this.textarea.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        this.send(this.textarea.value);
      }
    });

    this.sendButton = el(
      "button",
      { class: "pe-send-btn", title: "Send (Enter)", type: "button", onclick: () => this.onSendClick() },
      [icon("arrowUp", { size: 16 })],
    );

    this.composer = el("div", { class: "pe-composer" }, [
      el("div", { class: "pe-composer-box" }, [this.textarea, this.sendButton]),
      el("div", { class: "pe-composer-hint" }),
    ]);

    this.aside = el("aside", { class: "pe-sidebar", "aria-label": "PDF Explainer assistant" }, [
      el("header", { class: "pe-sidebar-header" }, [
        el("div", { class: "pe-sidebar-heading" }, [
          el("span", { class: "pe-status-dot" }),
          el("div", { class: "pe-sidebar-titles" }, [
            el("div", { class: "pe-sidebar-title", text: "PDF Explainer" }),
            this.subtitle,
          ]),
        ]),
        this.closeButton,
      ]),
      this.messagesEl,
      this.composer,
    ]);

    this.aside.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        this.close();
      }
    });

    document.body.append(this.aside);
  }

  onSendClick() {
    if (this.streaming) {
      this.abortController?.abort();
      return;
    }
    this.send(this.textarea.value);
  }

  autoResize() {
    this.textarea.style.height = "auto";
    this.textarea.style.height = `${Math.min(this.textarea.scrollHeight, 132)}px`;
  }

  open() {
    this.mount();
    const settings = this.getSettings();
    this.subtitle.textContent = settings.aiModel || "AI assistant";
    this.composer.querySelector(".pe-composer-hint").textContent = composerHint(settings.aiLanguage);
    this.aside.classList.add("pe-open");
    document.documentElement.classList.add("pe-sidebar-open");
  }

  close() {
    if (!this.mounted) {
      return;
    }
    this.abortController?.abort();
    this.abortController = null;
    this.streaming = false;
    this.aside.classList.remove("pe-open");
    document.documentElement.classList.remove("pe-sidebar-open");
  }

  isOpen() {
    return Boolean(this.mounted && this.aside.classList.contains("pe-open"));
  }

  /** Clears the conversation, keeping the panel open. */
  reset({ quote = null } = {}) {
    this.mount();
    this.abortController?.abort();
    this.abortController = null;
    this.streaming = false;
    this.messages = [{ role: "system", content: buildSystemPrompt(this.getSettings()) }];
    this.pendingQuote = quote;
    this.messagesEl.replaceChildren();

    if (quote) {
      this.messagesEl.append(this.renderQuote(quote));
    }
    this.updateSendButton();
    this.textarea.value = "";
    this.autoResize();
    this.textarea.focus();
    this.scrollToEnd(true);
  }

  renderQuote(quote) {
    const parts = [
      el("div", { class: "pe-quote-meta", text: quoteSummary(quote) }),
    ];
    if (quote.image) {
      parts.push(
        el("img", {
          class: "pe-quote-image",
          src: quote.image,
          alt: "Selected region of the PDF",
        }),
      );
    }
    if (quote.text) {
      parts.push(el("div", { class: "pe-quote-body", text: quote.text }));
    }
    return el("div", { class: "pe-quote-card" }, parts);
  }

  appendNotice(text) {
    this.messagesEl.append(el("div", { class: "pe-notice", text }));
    this.scrollToEnd();
  }

  appendUserBubble(text) {
    this.messagesEl.append(
      el("div", { class: "pe-msg pe-msg-user" }, [
        el("div", { class: "pe-bubble", text }),
      ]),
    );
    this.scrollToEnd();
  }

  appendAssistantBubble() {
    const body = el("div", { class: "pe-bubble pe-markdown" });
    const author = el("div", { class: "pe-author", text: this.getSettings().aiModel || "AI" });

    const copyButton = el(
      "button",
      {
        class: "pe-copy-btn",
        type: "button",
        title: "Copy answer",
        onclick: async () => {
          const copied = await copyText(body.textContent || "");
          copyButton.replaceChildren(icon(copied ? "check" : "copy", { size: 13 }));
          copyButton.title = copied ? "Copied" : "Copy answer";
          setTimeout(() => {
            copyButton.replaceChildren(icon("copy", { size: 13 }));
            copyButton.title = "Copy answer";
          }, 1400);
        },
      },
      [icon("copy", { size: 13 })],
    );

    const head = el("div", { class: "pe-msg-head" }, [author, copyButton]);
    const wrapper = el("div", { class: "pe-msg pe-msg-ai" }, [head, body]);
    this.messagesEl.append(wrapper);
    this.scrollToEnd();
    return { wrapper, body, author };
  }

  /** Builds the OpenAI style content for the first question of a selection. */
  buildUserContent(quote, question) {
    const parts = [];
    const textPieces = [];
    if (quote?.text) {
      textPieces.push(`PDF selection:\n"""\n${quote.text}\n"""`);
    } else if (quote?.image) {
      textPieces.push("The user selected the attached region of a PDF page.");
    }
    textPieces.push(question);
    parts.push({ type: "text", text: textPieces.join("\n\n") });

    if (quote?.image) {
      parts.push({ type: "image_url", image_url: { url: quote.image } });
    }
    return parts.length === 1 ? parts[0].text : parts;
  }

  async send(rawText) {
    if (this.streaming) {
      return;
    }
    const question = String(rawText || "").trim() || defaultExplainPrompt(this.getSettings().aiLanguage);

    if (this.messages.length === 0) {
      this.messages = [{ role: "system", content: buildSystemPrompt(this.getSettings()) }];
    }

    const quote = this.pendingQuote;
    this.pendingQuote = null;

    this.messages.push({ role: "user", content: this.buildUserContent(quote, question) });
    this.appendUserBubble(question);

    this.textarea.value = "";
    this.autoResize();

    await this.runCompletion();
  }

  async runCompletion() {
    const { wrapper, body } = this.appendAssistantBubble();
    const controller = new AbortController();
    this.abortController = controller;
    this.streaming = true;
    this.updateSendButton();
    body.classList.add("pe-streaming");
    body.append(el("div", { class: "pe-typing" }, [el("i"), el("i"), el("i")]));

    let answer = "";
    let frame = 0;

    const paint = () => {
      frame = 0;
      body.innerHTML = renderMarkdown(answer);
      this.scrollToEnd();
    };

    try {
      const result = await streamChat({
        settings: this.getSettings(),
        messages: this.messages,
        signal: controller.signal,
        onDelta: (chunk) => {
          if (!answer) {
            body.replaceChildren();
          }
          answer += chunk;
          if (!frame) {
            frame = requestAnimationFrame(paint);
          }
        },
        onNotice: (notice) => this.appendNotice(notice),
      });
      answer = result;
      if (frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
      body.classList.remove("pe-streaming");
      body.innerHTML = renderMarkdown(answer);
      this.messages.push({ role: "assistant", content: answer });
    } catch (error) {
      if (frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
      body.classList.remove("pe-streaming");
      if (error?.name === "AbortError") {
        body.innerHTML = answer ? renderMarkdown(answer) : "";
        if (answer) {
          this.messages.push({ role: "assistant", content: answer });
        }
        wrapper.remove();
      } else {
        const message =
          error instanceof AIError
            ? error.message
            : `Something went wrong: ${error?.message || error}`;
        body.innerHTML = "";
        body.append(el("div", { class: "pe-error", text: message }));
      }
    } finally {
      this.streaming = false;
      this.abortController = null;
      this.updateSendButton();
      this.scrollToEnd();
    }
  }

  updateSendButton() {
    if (!this.sendButton) {
      return;
    }
    this.sendButton.replaceChildren(icon(this.streaming ? "stop" : "arrowUp", { size: 16 }));
    this.sendButton.title = this.streaming ? "Stop" : "Send (Enter)";
    this.sendButton.classList.toggle("pe-stopping", this.streaming);
    this.textarea.disabled = this.streaming;
  }

  scrollToEnd(force = false) {
    if (!this.mounted) {
      return;
    }
    const el = this.messagesEl;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 160;
    if (force || nearBottom) {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    }
  }
}
