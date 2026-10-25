/**
 * PDF Explainer — background script
 *
 * Every PDF that Firefox would render inline is intercepted here and handed to
 * the bundled PDF.js viewer (pdfjs/web/viewer.html), which is where the
 * translation / AI features live.
 */

"use strict";

const VIEWER_PAGE = "pdfjs/web/viewer.html";

/** URLs served with these content types are considered PDFs. */
const PDF_CONTENT_TYPES = new Set(["application/pdf", "application/x-pdf"]);

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

/**
 * True when the response is an inline PDF we should take over.
 * PDFs sent as attachments are left alone: the user explicitly downloaded them.
 */
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

  // Some servers send PDFs as a generic binary stream.
  if (contentType === "application/octet-stream" || contentType === "") {
    const withoutHash = details.url.split("#")[0].split("?")[0];
    return /\.pdf$/i.test(withoutHash);
  }

  return false;
}

function buildViewerUrl(pdfUrl) {
  const viewerUrl = browser.runtime.getURL(VIEWER_PAGE);
  // `file=` is passed empty on purpose: it stops the stock viewer from loading
  // its bundled demo document, our script then opens `url` itself.
  return `${viewerUrl}?file=&url=${encodeURIComponent(pdfUrl)}`;
}

function onHeadersReceived(details) {
  // Never touch our own viewer page or anything that is not a top level load.
  if (details.tabId < 0) {
    return {};
  }
  if (!/^https?:/i.test(details.url)) {
    return {};
  }
  // Escape hatch: append #pdf-explainer=off to a URL to keep the native viewer.
  if (details.url.includes("pdf-explainer=off")) {
    return {};
  }
  if (details.url.startsWith(browser.runtime.getURL(""))) {
    return {};
  }
  if (!isInlinePdf(details)) {
    return {};
  }

  console.debug("[PDF Explainer] handing over", details.url);
  return { redirectUrl: buildViewerUrl(details.url) };
}

browser.webRequest.onHeadersReceived.addListener(
  onHeadersReceived,
  {
    urls: ["http://*/*", "https://*/*"],
    types: ["main_frame", "sub_frame"],
  },
  ["blocking", "responseHeaders"],
);
