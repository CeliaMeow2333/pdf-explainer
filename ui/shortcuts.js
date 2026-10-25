/**
 * Keyboard shortcut model.
 *
 * A shortcut is stored as { mods: ["ctrl"|"alt"|"shift"|"meta"], code: "KeyT" }.
 * `code` is a KeyboardEvent.code so the shortcut keeps working on any layout.
 * A shortcut may also be a lone modifier ("hold Shift"), in which case code is
 * null and the action fires on key release when no other key was pressed.
 */

import { isEditableTarget } from "./dom.js";

const MODIFIER_CODES = new Set([
  "ShiftLeft",
  "ShiftRight",
  "ControlLeft",
  "ControlRight",
  "AltLeft",
  "AltRight",
  "MetaLeft",
  "MetaRight",
]);

const CODE_LABELS = {
  Space: "Space",
  Enter: "Enter",
  Escape: "Esc",
  Tab: "Tab",
  Backspace: "⌫",
  Delete: "Del",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  Minus: "-",
  Equal: "=",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  Comma: ",",
  Period: ".",
  Slash: "/",
  Backquote: "`",
  Home: "Home",
  End: "End",
  PageUp: "PgUp",
  PageDown: "PgDn",
  PrintScreen: "PrtSc",
};

export function isMac() {
  return /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent);
}

export function codeLabel(code) {
  if (!code) {
    return "";
  }
  if (CODE_LABELS[code]) {
    return CODE_LABELS[code];
  }
  let match = /^Key([A-Z])$/.exec(code);
  if (match) {
    return match[1];
  }
  match = /^Digit(\d)$/.exec(code);
  if (match) {
    return match[1];
  }
  match = /^Numpad(\w+)$/.exec(code);
  if (match) {
    return `Num ${match[1]}`;
  }
  return code.replace(/([a-z])([A-Z])/g, "$1 $2");
}

export function modifierLabel(mod) {
  switch (mod) {
    case "ctrl":
      return isMac() ? "Control" : "Ctrl";
    case "alt":
      return isMac() ? "Option" : "Alt";
    case "shift":
      return "Shift";
    case "meta":
      return isMac() ? "Command" : "Meta";
    default:
      return mod;
  }
}

/** Ordered list of key names for display, e.g. ["Shift", "T"]. */
export function shortcutParts(shortcut) {
  if (!shortcut) {
    return [];
  }
  const order = ["ctrl", "alt", "shift", "meta"];
  const mods = order.filter((mod) => (shortcut.mods || []).includes(mod));
  const parts = mods.map(modifierLabel);
  if (shortcut.code) {
    parts.push(codeLabel(shortcut.code));
  }
  return parts;
}

export function shortcutText(shortcut) {
  return shortcutParts(shortcut).join(" + ") || "Not set";
}

export function normalizeShortcut(shortcut) {
  if (!shortcut || typeof shortcut !== "object") {
    return null;
  }
  const mods = (Array.isArray(shortcut.mods) ? shortcut.mods : []).filter((mod) =>
    ["ctrl", "alt", "shift", "meta"].includes(mod),
  );
  const code = typeof shortcut.code === "string" && shortcut.code ? shortcut.code : null;
  if (!code && mods.length === 0) {
    return null;
  }
  return { mods, code };
}

function modsMatch(shortcut, event) {
  const mods = shortcut.mods || [];
  return (
    mods.includes("ctrl") === event.ctrlKey &&
    mods.includes("alt") === event.altKey &&
    mods.includes("shift") === event.shiftKey &&
    mods.includes("meta") === event.metaKey
  );
}

export function matchesEvent(shortcut, event) {
  const spec = normalizeShortcut(shortcut);
  if (!spec || !spec.code) {
    return false;
  }
  return modsMatch(spec, event) && event.code === spec.code;
}

/** Build a shortcut object straight from a keydown event, or null if unusable. */
export function shortcutFromEvent(event) {
  if (MODIFIER_CODES.has(event.code)) {
    const mod = modifierFromCode(event.code);
    return mod ? { mods: [mod], code: null } : null;
  }
  const mods = [];
  if (event.ctrlKey) {
    mods.push("ctrl");
  }
  if (event.altKey) {
    mods.push("alt");
  }
  if (event.shiftKey) {
    mods.push("shift");
  }
  if (event.metaKey) {
    mods.push("meta");
  }
  const code = event.code || null;
  if (!code) {
    return null;
  }
  // Ignore bare modifier-ish keys that carry no meaning on their own.
  if (code === "CapsLock" || code === "NumLock" || code === "ScrollLock" || code === "ContextMenu") {
    return null;
  }
  return { mods, code };
}

function modifierFromCode(code) {
  if (code.startsWith("Shift")) {
    return "shift";
  }
  if (code.startsWith("Control")) {
    return "ctrl";
  }
  if (code.startsWith("Alt")) {
    return "alt";
  }
  if (code.startsWith("Meta")) {
    return "meta";
  }
  return null;
}

/**
 * Listens globally and dispatches the three PDF Explainer actions.
 * Returns { stop } to detach the listeners.
 */
export function createHotkeyManager({ getShortcuts, handler }) {
  let armed = null; // { action, shortcut } for a lone-modifier shortcut
  let consumed = false;

  const shouldIgnore = (event) =>
    event.repeat ||
    document.documentElement.hasAttribute("data-pe-hotkeys-paused") ||
    isEditableTarget(event.target);

  const onKeyDown = (event) => {
    if (shouldIgnore(event)) {
      return;
    }
    const shortcuts = getShortcuts();

    if (armed && !MODIFIER_CODES.has(event.code)) {
      consumed = true;
    }

    if (MODIFIER_CODES.has(event.code)) {
      const mod = modifierFromCode(event.code);
      for (const [action, shortcut] of Object.entries(shortcuts)) {
        const spec = normalizeShortcut(shortcut);
        if (spec && !spec.code && spec.mods.length === 1 && spec.mods[0] === mod) {
          armed = { action, shortcut: spec };
          consumed = false;
        }
      }
    }

    for (const [action, shortcut] of Object.entries(shortcuts)) {
      const spec = normalizeShortcut(shortcut);
      if (!spec || !spec.code || !matchesEvent(spec, event)) {
        continue;
      }
      event.preventDefault();
      event.stopPropagation();
      armed = null;
      handler(action, event);
      return;
    }
  };

  const onKeyUp = (event) => {
    if (!armed) {
      return;
    }
    const { action, shortcut } = armed;
    if (modifierFromCode(event.code) !== shortcut.mods[0]) {
      return;
    }
    armed = null;
    const fire = !consumed;
    consumed = false;
    if (fire && !isEditableTarget(event.target)) {
      event.preventDefault();
      handler(action, event);
    }
  };

  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("keyup", onKeyUp, true);

  return {
    stop() {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
    },
  };
}

/** Test whether a shortcut collides with another one (used by the recorder). */
export function shortcutsEqual(a, b) {
  const left = normalizeShortcut(a);
  const right = normalizeShortcut(b);
  if (!left || !right) {
    return false;
  }
  const sortMods = (mods) => [...mods].sort().join("+");
  return sortMods(left.mods) === sortMods(right.mods) && left.code === right.code;
}
