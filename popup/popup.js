import { ext, extensionUrl } from "../ui/compat.js";
import { icon } from "../ui/dom.js";

const VIEWER = "pdfjs/web/viewer.html";

const urlInput = document.getElementById("peUrlInput");
const hint = document.getElementById("peHint");
const openButton = document.getElementById("peOpenUrl");

document.getElementById("pePopupMark").append(icon("file", { size: 15 }));

function viewerUrl(params = {}) {
  const url = new URL(extensionUrl(VIEWER));
  // Keep the stock viewer from opening its demo file; our script opens `url`.
  url.searchParams.set("file", "");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

function normalizeUrl(raw) {
  const value = raw.trim();
  if (!value) {
    return "";
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    return value;
  }
  return `https://${value}`;
}

async function openInViewer(url) {
  await ext.tabs.create({ url });
  window.close();
}

openButton.addEventListener("click", () => {
  const target = normalizeUrl(urlInput.value);
  if (!target) {
    hint.textContent = "Paste a link to a PDF first.";
    urlInput.focus();
    return;
  }
  if (!/^https?:|^file:/i.test(target)) {
    hint.textContent = "Only http(s) links can be opened here.";
    return;
  }
  hint.textContent = "";
  openInViewer(viewerUrl({ url: target }));
});

urlInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    openButton.click();
  }
});

document.getElementById("peOpenSettings").addEventListener("click", () => {
  openInViewer(viewerUrl({ settings: "1" }));
});

document.getElementById("peOpenSample").addEventListener("click", () => {
  const sample = extensionUrl("pdfjs/web/compressed.tracemonkey-pldi-09.pdf");
  openInViewer(viewerUrl({ url: sample }));
});

/** Offers the current tab when it already points at a PDF. */
async function prefillFromActiveTab() {
  try {
    const [tab] = await ext.tabs.query({ active: true, currentWindow: true });
    const url = tab?.url || "";
    if (/^https?:/i.test(url) && /\.pdf($|[?#])/i.test(url)) {
      urlInput.value = url;
      urlInput.select();
    }
  } catch {
    // Reading the active tab is a nicety, never a requirement.
  }
}

urlInput.focus();
prefillFromActiveTab();
