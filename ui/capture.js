/**
 * "AI Answer" capture mode: dim the viewer, let the user drag a rectangle over
 * the page, preview the pixels that will be cropped and, on confirm, produce a
 * PNG plus the text that lies inside the rectangle.
 *
 * The preview is drawn from the already rendered PDF.js page canvases, so what
 * the user sees inside the marquee is exactly what the assistant receives.
 */

import { el, icon } from "./dom.js";

function normalizeRect(x1, y1, x2, y2) {
  return {
    left: Math.min(x1, x2),
    top: Math.min(y1, y2),
    right: Math.max(x1, x2),
    bottom: Math.max(y1, y2),
  };
}

function isVisible(element) {
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function pageCanvas(page) {
  return page.querySelector(".canvasWrapper canvas") || page.querySelector("canvas");
}

function pageHits(rect) {
  const viewer = document.getElementById("viewer");
  if (!viewer) {
    return [];
  }
  const hits = [];
  for (const page of viewer.querySelectorAll(".page")) {
    const canvas = pageCanvas(page);
    if (!canvas || !isVisible(canvas)) {
      continue;
    }
    const box = canvas.getBoundingClientRect();
    const left = Math.max(rect.left, box.left);
    const top = Math.max(rect.top, box.top);
    const right = Math.min(rect.right, box.right);
    const bottom = Math.min(rect.bottom, box.bottom);
    if (right - left < 1 || bottom - top < 1) {
      continue;
    }
    hits.push({ page, canvas, box, left, top, right, bottom });
  }
  return hits;
}

/**
 * Draws the page pixels under `rect` into `target` and returns the page numbers
 * that contributed to the image.
 */
function drawRegion(target, rect, { maxWidth = 0 } = {}) {
  const hits = pageHits(rect);
  if (!hits.length) {
    return null;
  }

  const width = Math.max(1, rect.right - rect.left);
  const height = Math.max(1, rect.bottom - rect.top);
  const first = hits[0];
  let ratio = first.canvas.width / Math.max(1, first.box.width);
  ratio = Math.min(3, Math.max(0.5, ratio));
  if (maxWidth && width * ratio > maxWidth) {
    ratio = maxWidth / width;
  }

  target.width = Math.max(1, Math.round(width * ratio));
  target.height = Math.max(1, Math.round(height * ratio));
  const ctx = target.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, target.width, target.height);

  for (const hit of hits) {
    const scaleX = hit.canvas.width / hit.box.width;
    const scaleY = hit.canvas.height / hit.box.height;
    ctx.drawImage(
      hit.canvas,
      (hit.left - hit.box.left) * scaleX,
      (hit.top - hit.box.top) * scaleY,
      (hit.right - hit.left) * scaleX,
      (hit.bottom - hit.top) * scaleY,
      (hit.left - rect.left) * ratio,
      (hit.top - rect.top) * ratio,
      (hit.right - hit.left) * ratio,
      (hit.bottom - hit.top) * ratio,
    );
  }

  return hits
    .map((hit) => Number(hit.page.dataset.pageNumber))
    .filter((value) => Number.isFinite(value) && value > 0);
}

/** Text layer spans whose centre falls inside the rectangle, in reading order. */
function extractText(rect) {
  const spans = document.querySelectorAll("#viewer .textLayer span");
  const items = [];
  for (const span of spans) {
    const text = span.textContent;
    if (!text || !text.trim()) {
      continue;
    }
    const box = span.getBoundingClientRect();
    if (box.width === 0 && box.height === 0) {
      continue;
    }
    const cx = (box.left + box.right) / 2;
    const cy = (box.top + box.bottom) / 2;
    if (cx < rect.left || cx > rect.right || cy < rect.top || cy > rect.bottom) {
      continue;
    }
    items.push({ text: text.trim(), x: box.left, y: cy, height: box.height });
  }

  items.sort((a, b) => a.y - b.y || a.x - b.x);
  let output = "";
  let lastY = null;
  for (const item of items) {
    const tolerance = Math.max(6, item.height * 0.6);
    if (lastY === null) {
      output += item.text;
    } else if (Math.abs(item.y - lastY) > tolerance) {
      output += `\n${item.text}`;
    } else {
      output += ` ${item.text}`;
    }
    lastY = item.y;
  }
  return output.trim();
}

/**
 * Starts capture mode.
 * @param {{ onComplete: Function, onCancel: Function }} handlers
 */
export function startRegionCapture({ onComplete, onCancel }) {
  document.documentElement.setAttribute("data-pe-hotkeys-paused", "");

  const hint = el("div", { class: "pe-capture-hint" }, [
    icon("search", { size: 14 }),
    el("span", { text: "Drag to select an area of the page" }),
    el("kbd", { text: "Esc" }),
    el("span", { text: "to cancel" }),
  ]);

  const dim = el("div", { class: "pe-capture-dim" });
  const preview = el("canvas", { class: "pe-marquee-preview" });
  const marquee = el("div", { class: "pe-marquee" }, [preview]);
  marquee.hidden = true;

  const confirmButton = el(
    "button",
    { class: "pe-capture-action pe-capture-confirm", type: "button", title: "Use this selection" },
    [icon("check", { size: 16 })],
  );
  const cancelButton = el(
    "button",
    { class: "pe-capture-action pe-capture-cancel", type: "button", title: "Cancel" },
    [icon("close", { size: 16 })],
  );
  const actions = el("div", { class: "pe-capture-actions" }, [confirmButton, cancelButton]);
  actions.hidden = true;

  const layer = el("div", { class: "pe-capture-layer" }, [dim, hint, marquee, actions]);
  document.body.append(layer);

  let startX = 0;
  let startY = 0;
  let dragging = false;
  let rect = null;
  let finished = false;
  let frame = 0;

  const clearSelection = () => {
    marquee.hidden = true;
    actions.hidden = true;
    preview.width = 1;
    preview.height = 1;
  };

  const paint = () => {
    frame = 0;
    if (!rect || rect.right - rect.left < 4 || rect.bottom - rect.top < 4) {
      clearSelection();
      return;
    }
    marquee.hidden = false;
    marquee.style.left = `${rect.left}px`;
    marquee.style.top = `${rect.top}px`;
    marquee.style.width = `${rect.right - rect.left}px`;
    marquee.style.height = `${rect.bottom - rect.top}px`;
    drawRegion(preview, rect, { maxWidth: 1200 });
  };

  const schedulePaint = () => {
    if (frame) {
      return;
    }
    frame = requestAnimationFrame(paint);
  };

  const placeActions = () => {
    if (!rect) {
      return;
    }
    const top = Math.min(rect.bottom + 10, window.innerHeight - 52);
    const left = Math.min(rect.right, window.innerWidth - 92);
    actions.style.top = `${Math.max(8, top)}px`;
    actions.style.left = `${Math.max(8, left - 84)}px`;
  };

  const cleanup = () => {
    if (finished) {
      return;
    }
    finished = true;
    if (frame) {
      cancelAnimationFrame(frame);
    }
    document.documentElement.removeAttribute("data-pe-hotkeys-paused");
    document.removeEventListener("keydown", onKeyDown, true);
    layer.remove();
  };

  const cancel = () => {
    if (finished) {
      return;
    }
    cleanup();
    onCancel?.();
  };

  const confirm = () => {
    if (finished || !rect) {
      return;
    }
    const selected = rect;
    const output = document.createElement("canvas");
    const pages = drawRegion(output, selected, { maxWidth: 1600 });
    if (!pages) {
      cancel();
      return;
    }
    const text = extractText(selected);
    cleanup();
    onComplete?.({
      image: output.toDataURL("image/png"),
      pages,
      text,
      rect: selected,
    });
  };

  function onKeyDown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      cancel();
    } else if (event.key === "Enter" && rect) {
      event.preventDefault();
      event.stopPropagation();
      confirm();
    }
  }

  layer.addEventListener("pointerdown", (event) => {
    // Clicks on the ✓ / ✕ buttons must not start a new selection.
    if (event.button !== 0 || event.target.closest(".pe-capture-actions")) {
      return;
    }
    startX = event.clientX;
    startY = event.clientY;
    dragging = true;
    rect = null;
    actions.hidden = true;
    clearSelection();
    layer.setPointerCapture(event.pointerId);
  });

  layer.addEventListener("pointermove", (event) => {
    if (!dragging) {
      return;
    }
    rect = normalizeRect(startX, startY, event.clientX, event.clientY);
    schedulePaint();
  });

  layer.addEventListener("pointerup", (event) => {
    if (!dragging) {
      return;
    }
    dragging = false;
    layer.releasePointerCapture?.(event.pointerId);
    rect = normalizeRect(startX, startY, event.clientX, event.clientY);
    if (rect.right - rect.left < 12 || rect.bottom - rect.top < 12) {
      rect = null;
      clearSelection();
      return;
    }
    paint();
    placeActions();
    actions.hidden = false;
  });

  confirmButton.addEventListener("click", (event) => {
    event.stopPropagation();
    confirm();
  });
  cancelButton.addEventListener("click", (event) => {
    event.stopPropagation();
    cancel();
  });

  document.addEventListener("keydown", onKeyDown, true);

  return { cancel };
}
