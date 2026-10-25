/** Small DOM helpers shared by every PDF Explainer surface. */

export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) {
      continue;
    }
    if (key === "class") {
      node.className = value;
    } else if (key === "html") {
      node.innerHTML = value;
    } else if (key === "text") {
      node.textContent = value;
    } else if (key === "dataset") {
      Object.assign(node.dataset, value);
    } else if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else {
      node.setAttribute(key, value === true ? "" : String(value));
    }
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined || child === false) {
      continue;
    }
    node.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return node;
}

const ICON_PATHS = {
  gear: [
    '<circle cx="12" cy="12" r="3.2"/>',
    '<path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.9 19.3a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.7 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9.1a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.05a1.7 1.7 0 0 0 1.56 1.03H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1.03z"/>',
  ],
  close: ['<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'],
  check: ['<path d="m4.5 12.5 4.5 4.5L19.5 6.5"/>'],
  arrowUp: ['<path d="M12 19V5"/><path d="m5.5 11.5 6.5-6.5 6.5 6.5"/>'],
  translate: [
    '<path d="M3 5h10"/><path d="M8 3v2"/><path d="M10.5 5c0 4.2-2.6 7.7-6.5 9.5"/>',
    '<path d="M5 9.5c1.6 2.6 4 4.4 6.5 5.2"/>',
    '<path d="m12.5 21 4-10 4 10"/><path d="M14 17.5h5"/>',
  ],
  sparkle: [
    '<path d="M12 3l1.7 4.6L18.5 9.4l-4.8 1.8L12 16l-1.7-4.8L5.5 9.4l4.8-1.8z"/>',
    '<path d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>',
  ],
  stop: ['<rect x="7" y="7" width="10" height="10" rx="2"/>'],
  search: ['<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'],
  copy: [
    '<rect x="9" y="9" width="11" height="11" rx="2.4"/>',
    '<path d="M15 5.6A2.6 2.6 0 0 0 12.4 3H6a3 3 0 0 0-3 3v6.4A2.6 2.6 0 0 0 5.6 15"/>',
  ],
  file: [
    '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/>',
    '<path d="M14 3v5h5"/>',
  ],
};

export function icon(name, { size = 18, className = "pe-icon" } = {}) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.7");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", className);
  svg.innerHTML = (ICON_PATHS[name] || []).join("");
  return svg;
}

export function isEditableTarget(target) {
  if (!target || target.nodeType !== Node.ELEMENT_NODE) {
    return false;
  }
  const tag = target.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") {
    return true;
  }
  return Boolean(target.isContentEditable);
}

/** Copies text to the clipboard, falling back to a hidden textarea. */
export async function copyText(value) {
  const text = String(value ?? "");
  if (!text) {
    return false;
  }
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Clipboard API needs a user gesture and the clipboardWrite permission.
  }
  try {
    const area = el("textarea", { style: "position:fixed;opacity:0;pointer-events:none;" });
    area.value = text;
    document.body.append(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Extremely small, safe markdown renderer (no raw HTML passes through). */
export function renderMarkdown(source) {
  const blocks = [];
  let text = escapeHtml(source).replace(/```(\w*)\n?([\s\S]*?)```/g, (_m, lang, code) => {
    const index = blocks.push(`<pre class="pe-code"><code>${code.replace(/\n$/, "")}</code></pre>`) - 1;
    return `\u0000BLOCK${index}\u0000`;
  });

  const lines = text.split("\n");
  const out = [];
  let listType = null;

  const closeList = () => {
    if (listType) {
      out.push(`</${listType}>`);
      listType = null;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/^(\u0000BLOCK\d+\u0000)$/, "$1");
    if (/^\u0000BLOCK\d+\u0000$/.test(line.trim())) {
      closeList();
      out.push(line.trim());
      continue;
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      closeList();
      const level = Math.min(4, heading[1].length) + 1;
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }
    const bullet = /^\s*[-*+]\s+(.*)$/.exec(line);
    if (bullet) {
      if (listType !== "ul") {
        closeList();
        out.push("<ul>");
        listType = "ul";
      }
      out.push(`<li>${inline(bullet[1])}</li>`);
      continue;
    }
    const ordered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (ordered) {
      if (listType !== "ol") {
        closeList();
        out.push("<ol>");
        listType = "ol";
      }
      out.push(`<li>${inline(ordered[1])}</li>`);
      continue;
    }
    const quote = /^&gt;\s?(.*)$/.exec(line);
    if (quote) {
      closeList();
      out.push(`<blockquote>${inline(quote[1])}</blockquote>`);
      continue;
    }
    if (line.trim() === "") {
      closeList();
      continue;
    }
    closeList();
    out.push(`<p>${inline(line)}</p>`);
  }
  closeList();

  let html = out.join("");
  html = html.replace(/\u0000BLOCK(\d+)\u0000/g, (_m, index) => blocks[Number(index)] || "");
  return html;
}

function inline(value) {
  return value
    .replace(/`([^`]+)`/g, '<code class="pe-inline-code">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1<em>$2</em>");
}
