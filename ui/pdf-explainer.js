/**
 * PDF Explainer — viewer entry point.
 *
 * Loaded by pdfjs/web/viewer.html after the stock PDF.js viewer has started.
 * Everything here augments that viewer: the settings button, the PDF hand-off
 * from the background script, and the three actions (translate / explain /
 * answer).
 */

import { el, icon } from "./dom.js";
import { ChatSidebar } from "./sidebar.js";
import { openSettingsPanel } from "./settings-panel.js";
import { createHotkeyManager, shortcutText } from "./shortcuts.js";
import { getTranslatePopup } from "./translate.js";
import { startRegionCapture } from "./capture.js";
import { loadSettings, readViewerParams, saveSettings, subscribeToSettings } from "./storage.js";

const params = readViewerParams();

let settings = null;
let sidebar = null;
let hotkeys = null;

/* ------------------------------------------------------------------ utils */

function normalizeSelectionText(value) {
  return String(value || "")
    .replace(/\u00ad/g, "")
    .replace(/[ \t]*\n[ \t]*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getSelectionInfo() {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
    return null;
  }
  const text = normalizeSelectionText(selection.toString());
  if (!text) {
    return null;
  }
  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  const node = range.startContainer;
  const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  const page = element?.closest?.(".page");
  const pageNumber = Number(page?.dataset.pageNumber) || null;
  return {
    text,
    rect,
    pages: pageNumber ? [pageNumber] : [],
  };
}

let toastTimer = 0;

function showToast(message, { tone = "info" } = {}) {
  let toast = document.querySelector(".pe-toast");
  if (!toast) {
    toast = el("div", { class: "pe-toast", role: "status" });
    document.body.append(toast);
  }
  toast.textContent = message;
  toast.classList.toggle("pe-toast-warn", tone === "warn");
  toast.classList.add("pe-toast-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("pe-toast-visible"), 3200);
}

/* ------------------------------------------------------------ settings UI */

function mountSettingsButton() {
  if (document.getElementById("peSettingsButton")) {
    return;
  }
  const button = el(
    "button",
    {
      id: "peSettingsButton",
      class: "pe-toolbar-button",
      type: "button",
      title: "PDF Explainer settings",
      "aria-label": "PDF Explainer settings",
    },
    [icon("gear", { size: 17 })],
  );
  button.addEventListener("click", openSettings);

  const right = document.getElementById("toolbarViewerRight");
  if (right) {
    right.append(button);
  } else {
    button.classList.add("pe-toolbar-button-floating");
    document.body.append(button);
  }
}

function openSettings({ focusApiKey = false } = {}) {
  openSettingsPanel({
    settings,
    focusApiKey: focusApiKey || !settings.aiApiKey,
    onSave: async (next) => {
      // A saved key re-arms the first-run prompt for the day it gets cleared.
      settings = await saveSettings({
        ...next,
        apiKeyPromptDismissed: next.aiApiKey ? false : settings.apiKeyPromptDismissed,
      });
      showToast("Settings saved");
      refreshSidebarChrome();
    },
  });
}

function refreshSidebarChrome() {
  if (sidebar?.isOpen()) {
    sidebar.open();
  }
}

/* ---------------------------------------------------------------- actions */

function hintMissingSelection(action) {
  const shortcut = shortcutText(settings.shortcuts[action]);
  showToast(`Select some text first, then press ${shortcut}.`, { tone: "warn" });
}

function actionTranslate() {
  const selection = getSelectionInfo();
  if (!selection) {
    hintMissingSelection("translate");
    return;
  }
  getTranslatePopup().show({
    anchorRect: selection.rect,
    text: selection.text,
    target: settings.translateLanguage,
  });
}

/** Sends the reader to Settings when the AI features have no credentials yet. */
function requireApiKey() {
  if (settings.aiApiKey) {
    return true;
  }
  openSettings({ focusApiKey: true });
  showToast("Add your AI API key in Settings to use this feature.", { tone: "warn" });
  return false;
}

function actionExplain() {
  const selection = getSelectionInfo();
  if (!selection) {
    hintMissingSelection("explain");
    return;
  }
  if (!requireApiKey()) {
    return;
  }
  getTranslatePopup().hide();
  ensureSidebar().reset({ quote: { text: selection.text, pages: selection.pages } });
  sidebar.open();
  sidebar.send("").catch(() => {});
}

function actionAnswer() {
  if (!requireApiKey()) {
    return;
  }
  getTranslatePopup().hide();
  startRegionCapture({
    onComplete: ({ image, text, pages }) => {
      ensureSidebar().reset({ quote: { text, image, pages } });
      sidebar.open();
      sidebar.textarea?.focus();
    },
    onCancel: () => showToast("Selection cancelled"),
  });
}

function ensureSidebar() {
  if (!sidebar) {
    sidebar = new ChatSidebar({ getSettings: () => settings });
  }
  return sidebar;
}

/* ------------------------------------------------------------ pdf loading */

function showLoadingPill() {
  const pill = el("div", { class: "pe-loading", id: "peLoading" }, [
    el("span", { class: "pe-spinner" }),
    el("span", { text: "Opening PDF…" }),
  ]);
  document.body.append(pill);
  return pill;
}

function showLoadError(url, error) {
  document.getElementById("peLoading")?.remove();
  const message = String(error?.message || error || "Unknown error");

  const close = () => overlay.remove();
  const retry = () => {
    close();
    loadPdfIntoViewer(url);
  };

  const overlay = el("div", { class: "pe-overlay pe-overlay-error" }, [
    el("div", { class: "pe-modal pe-modal-small", role: "alertdialog" }, [
      el("header", { class: "pe-modal-header" }, [
        el("div", {}, [
          el("h2", { class: "pe-modal-title", text: "Could not open this PDF" }),
          el("p", { class: "pe-modal-subtitle", text: "PDF Explainer could not download the file." }),
        ]),
      ]),
      el("div", { class: "pe-modal-body" }, [
        el("pre", { class: "pe-error-detail", text: message }),
        el("p", {
          class: "pe-section-note",
          text: "The server may require a sign-in or block direct downloads. Check the link, or open the file from the site itself.",
        }),
      ]),
      el("footer", { class: "pe-modal-footer" }, [
        el("div", { class: "pe-spacer" }),
        el("button", { class: "pe-btn pe-btn-ghost", type: "button", onclick: close }, ["Close"]),
        el("button", { class: "pe-btn pe-btn-primary", type: "button", onclick: retry }, ["Retry"]),
      ]),
    ]),
  ]);
  document.body.append(overlay);
}

/** Hands the PDF over to the stock PDF.js viewer, with a fetch fallback. */
async function loadPdfIntoViewer(url) {
  const app = window.PDFViewerApplication;
  if (!app) {
    return;
  }
  await app.initializedPromise;
  const pill = showLoadingPill();

  try {
    await app.open({ url, withCredentials: true, originalUrl: url });
    pill.remove();
    return;
  } catch (firstError) {
    console.debug("[PDF Explainer] direct load failed, retrying with fetch", firstError);
  }

  try {
    const response = await fetch(url, { credentials: "include" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`.trim());
    }
    const data = new Uint8Array(await response.arrayBuffer());
    await app.open({ data, originalUrl: url });
    pill.remove();
  } catch (error) {
    console.warn("[PDF Explainer] could not load PDF", error);
    showLoadError(url, error);
  }
}

/* ------------------------------------------------------------------ setup */

function isViewerReady() {
  return Boolean(window.PDFViewerApplication?.initializedPromise);
}

async function waitForViewer() {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (window.PDFViewerApplication) {
      await window.PDFViewerApplication.initializedPromise;
      return window.PDFViewerApplication;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("The PDF.js viewer did not start.");
}

async function boot() {
  settings = await loadSettings();
  subscribeToSettings((next) => {
    settings = next;
  });

  mountSettingsButton();

  hotkeys = createHotkeyManager({
    getShortcuts: () => settings.shortcuts,
    handler: (action) => {
      try {
        if (action === "translate") {
          actionTranslate();
        } else if (action === "explain") {
          actionExplain();
        } else if (action === "answer") {
          actionAnswer();
        }
      } catch (error) {
        console.error("[PDF Explainer] action failed", error);
        showToast(String(error?.message || error), { tone: "warn" });
      }
    },
  });

  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Escape") {
        return;
      }
      // Dialogs and capture mode handle Escape themselves.
      if (document.querySelector(".pe-overlay")) {
        return;
      }
      if (sidebar?.isOpen() && !document.documentElement.hasAttribute("data-pe-hotkeys-paused")) {
        sidebar.close();
      }
    },
    true,
  );

  await waitForViewer();

  if (params.pdfUrl) {
    await loadPdfIntoViewer(params.pdfUrl);
  }

  if (params.openSettings) {
    openSettings();
    return;
  }

  // First run: ask for the API key straight away, once.
  if (!settings.aiApiKey && !settings.apiKeyPromptDismissed) {
    try {
      settings = await saveSettings({ ...settings, apiKeyPromptDismissed: true });
    } catch (error) {
      console.warn("[PDF Explainer] could not remember the key prompt", error);
    }
    openSettings({ focusApiKey: true });
  }
}

boot().catch((error) => {
  console.error("[PDF Explainer] boot failed", error);
});

export { sidebar, hotkeys };
