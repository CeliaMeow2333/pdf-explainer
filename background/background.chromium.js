/**
 * PDF Explainer — MV3 service worker (Chromium).
 *
 * Chrome no longer allows blocking `webRequest` redirects for regular
 * extensions, so interception works in two steps: we *observe* the response
 * headers, and when a top level navigation turns out to be an inline PDF we
 * simply navigate that tab to the bundled PDF.js viewer.
 */

"use strict";

const VIEWER_PAGE = "pdfjs/web/viewer.html";
const PDF_CONTENT_TYPES = new Set(["application/pdf", "application/x-pdf"]);

/** tabId → { url, at } — guards against redirecting the same navigation twice. */
const recentHandoffs = new Map();

function getHeader(headers, name) {
  if (!headers) {
    return undefined;
  }
  const lower = name.toLowerCase();
  for (const header of headers) {
    if (header.name.toLowerCase() === lower) {
      return header.value || "";
    }
  }
  return undefined;
}

function isInlinePdf(details) {
  const headers = details.responseHeaders;
  const disposition = getHeader(headers, "content-disposition") || "";
  if (/^\s*attachment/i.test(disposition)) {
    return false;
  }

  const contentType = (getHeader(headers, "content-type") || "")
    .split(";")[0]
    .trim()
    .toLowerCase();

  if (PDF_CONTENT_TYPES.has(contentType)) {
    return true;
  }

  if (contentType === "application/octet-stream" || contentType === "") {
    const withoutHash = details.url.split("#")[0].split("?")[0];
    return /\.pdf$/i.test(withoutHash);
  }

  return false;
}

function buildViewerUrl(pdfUrl) {
  // `file=` stays empty so the stock viewer does not load its demo document.
  return `${chrome.runtime.getURL(VIEWER_PAGE)}?file=&url=${encodeURIComponent(pdfUrl)}`;
}

function onHeadersReceived(details) {
  if (details.tabId < 0 || details.frameId !== 0) {
    return;
  }
  if (!/^https?:/i.test(details.url)) {
    return;
  }
  if (details.url.includes("pdf-explainer=off")) {
    return;
  }
  if (!isInlinePdf(details)) {
    return;
  }

  const previous = recentHandoffs.get(details.tabId);
  if (previous && previous.url === details.url && Date.now() - previous.at < 4000) {
    return;
  }
  recentHandoffs.set(details.tabId, { url: details.url, at: Date.now() });

  console.debug("[PDF Explainer] handing over", details.url);
  chrome.tabs.update(details.tabId, { url: buildViewerUrl(details.url) }).catch((error) => {
    console.warn("[PDF Explainer] could not open the viewer", error);
    recentHandoffs.delete(details.tabId);
  });
}

chrome.webRequest.onHeadersReceived.addListener(onHeadersReceived, {
  urls: ["http://*/*", "https://*/*"],
  types: ["main_frame"],
});

chrome.tabs.onRemoved.addListener((tabId) => {
  recentHandoffs.delete(tabId);
});

// A fresh navigation in a tab clears the guard, so reopening the same PDF works.
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading") {
    recentHandoffs.delete(tabId);
  }
});
