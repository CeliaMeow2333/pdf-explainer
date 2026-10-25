/** Settings dialog: languages, AI provider and keyboard shortcuts. */

import { el, icon } from "./dom.js";
import { LANGUAGES } from "./languages.js";
import { DEFAULT_SETTINGS, PLATFORMS } from "./storage.js";
import {
  modifierLabel,
  normalizeShortcut,
  shortcutFromEvent,
  shortcutParts,
  shortcutsEqual,
} from "./shortcuts.js";

const PLATFORM_MODELS = {
  deepseek: "deepseek-flash",
  openai: "gpt-4o-mini",
  custom: "",
};

const SHORTCUT_ROWS = [
  { action: "translate", label: "Translate selection", tag: "translate" },
  { action: "explain", label: "AI explain selection", tag: "sparkle" },
  { action: "answer", label: "AI answer (select an area)", tag: "search" },
];

function cloneSettings(settings) {
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    shortcuts: { ...DEFAULT_SETTINGS.shortcuts, ...(settings.shortcuts || {}) },
  };
}

function select(options, value, onChange) {
  const node = el(
    "select",
    { class: "pe-select" },
    options.map((option) =>
      el("option", { value: option.value, selected: option.value === value }, [option.label]),
    ),
  );
  node.addEventListener("change", () => onChange(node.value));
  return node;
}

function shortcutChips(shortcut) {
  const parts = shortcutParts(shortcut);
  if (!parts.length) {
    return [el("span", { class: "pe-shortcut-empty", text: "Not set" })];
  }
  return parts.map((part) => el("kbd", { class: "pe-chip", text: part }));
}

export function openSettingsPanel({ settings, onSave, focusApiKey = false }) {
  const draft = cloneSettings(settings);
  let recorderCleanup = null;
  /** Rebuilt on every refresh, so the reference is refreshed too. */
  let keyInputRef = null;
  let keyRowRef = null;

  const warning = el("div", { class: "pe-warn", hidden: true });
  const modalBody = el("div", { class: "pe-modal-body" });

  const close = () => {
    recorderCleanup?.();
    overlay.remove();
    document.removeEventListener("keydown", onOverlayKeyDown, true);
    document.documentElement.removeAttribute("data-pe-hotkeys-paused");
  };

  const showWarning = (message) => {
    warning.textContent = message;
    warning.hidden = !message;
  };

  const shortcutButton = (row) => {
    const button = el("button", {
      class: "pe-shortcut-btn",
      type: "button",
      title: "Click, then press the key combination",
    });
    const paint = () => button.replaceChildren(...shortcutChips(draft.shortcuts[row.action]));

    const startRecording = () => {
      if (recorderCleanup) {
        recorderCleanup();
      }
      showWarning("");
      button.classList.add("pe-recording");
      button.replaceChildren(el("span", { class: "pe-recording-text", text: "Press keys…" }));

      let pressedOther = false;
      let pendingModifier = null;

      const onKeyDown = (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          stop();
          paint();
          return;
        }
        event.preventDefault();
        event.stopPropagation();

        const candidate = shortcutFromEvent(event);
        if (!candidate) {
          return;
        }
        if (!candidate.code) {
          pendingModifier = candidate;
          button.replaceChildren(
            ...candidate.mods.map((mod) => el("kbd", { class: "pe-chip", text: modifierLabel(mod) })),
          );
          return;
        }
        pressedOther = true;
        apply(candidate);
      };

      const onKeyUp = (event) => {
        if (!pendingModifier || pressedOther) {
          return;
        }
        const modCode = event.code;
        const mod = modCode.startsWith("Shift")
          ? "shift"
          : modCode.startsWith("Control")
            ? "ctrl"
            : modCode.startsWith("Alt")
              ? "alt"
              : modCode.startsWith("Meta")
                ? "meta"
                : null;
        if (mod && pendingModifier.mods.includes(mod)) {
          event.preventDefault();
          event.stopPropagation();
          apply(pendingModifier);
        }
      };

      const apply = (candidate) => {
        const conflict = SHORTCUT_ROWS.find(
          (other) => other.action !== row.action && shortcutsEqual(draft.shortcuts[other.action], candidate),
        );
        if (conflict) {
          const conflictLabel = SHORTCUT_ROWS.find((item) => item.action === conflict.action)?.label;
          showWarning(`That combination is already used by “${conflictLabel}”.`);
          stop();
          paint();
          return;
        }
        draft.shortcuts[row.action] = normalizeShortcut(candidate);
        stop();
        paint();
      };

      const stop = () => {
        document.removeEventListener("keydown", onKeyDown, true);
        document.removeEventListener("keyup", onKeyUp, true);
        button.classList.remove("pe-recording");
        recorderCleanup = null;
      };

      document.addEventListener("keydown", onKeyDown, true);
      document.addEventListener("keyup", onKeyUp, true);
      recorderCleanup = () => {
        stop();
        paint();
      };
    };

    button.addEventListener("click", () => {
      if (recorderCleanup) {
        recorderCleanup();
        return;
      }
      startRecording();
    });

    paint();
    return button;
  };

  const row = (label, control, hint) =>
    el("div", { class: "pe-row" }, [
      el("div", { class: "pe-row-label" }, [
        el("span", { text: label }),
        hint ? el("span", { class: "pe-row-hint", text: hint }) : null,
      ]),
      control,
    ]);

  const buildBody = () => {
    const languageRow = row(
      "AI explanation language",
      select(
        LANGUAGES.map((language) => ({ value: language.code, label: language.label })),
        draft.aiLanguage,
        (value) => {
          draft.aiLanguage = value;
        },
      ),
    );

    const translationRow = row(
      "Translation language",
      select(
        LANGUAGES.map((language) => ({ value: language.code, label: language.label })),
        draft.translateLanguage,
        (value) => {
          draft.translateLanguage = value;
        },
      ),
    );

    const platformSelect = select(
      PLATFORMS.map((platform) => ({ value: platform.id, label: platform.label })),
      draft.aiPlatform,
      (value) => {
        draft.aiPlatform = value;
        const preset = PLATFORMS.find((platform) => platform.id === value);
        if (preset?.baseUrl) {
          draft.aiBaseUrl = preset.baseUrl;
        }
        if (PLATFORM_MODELS[value]) {
          draft.aiModel = PLATFORM_MODELS[value];
        }
        baseUrlInput.value = draft.aiBaseUrl;
        modelInput.value = draft.aiModel;
      },
    );

    const baseUrlInput = el("input", {
      class: "pe-input",
      type: "url",
      spellcheck: "false",
      placeholder: "https://api.deepseek.com/v1",
      value: draft.aiBaseUrl,
    });
    baseUrlInput.addEventListener("input", () => {
      draft.aiBaseUrl = baseUrlInput.value;
    });

    const modelInput = el("input", {
      class: "pe-input",
      type: "text",
      spellcheck: "false",
      placeholder: "deepseek-flash",
      value: draft.aiModel,
    });
    modelInput.addEventListener("input", () => {
      draft.aiModel = modelInput.value;
    });

    const keyInput = el("input", {
      class: "pe-input",
      type: "password",
      spellcheck: "false",
      autocomplete: "off",
      placeholder: "sk-…",
      value: draft.aiApiKey,
    });
    keyInput.addEventListener("input", () => {
      draft.aiApiKey = keyInput.value;
      keyInput.classList.remove("pe-attention");
    });
    keyInputRef = keyInput;

    const revealButton = el(
      "button",
      {
        class: "pe-input-addon",
        type: "button",
        title: "Show API key",
        onclick: () => {
          const revealed = keyInput.type === "text";
          keyInput.type = revealed ? "password" : "text";
          revealButton.textContent = revealed ? "Show" : "Hide";
        },
      },
      ["Show"],
    );

    const visionToggle = el("button", {
      class: `pe-switch${draft.aiVision ? " pe-on" : ""}`,
      type: "button",
      role: "switch",
      "aria-checked": String(draft.aiVision),
      title: "Let the assistant look at selected images",
    });
    visionToggle.append(el("span", { class: "pe-switch-knob" }));
    visionToggle.addEventListener("click", () => {
      draft.aiVision = !draft.aiVision;
      visionToggle.classList.toggle("pe-on", draft.aiVision);
      visionToggle.setAttribute("aria-checked", String(draft.aiVision));
    });

    const shortcutRows = SHORTCUT_ROWS.map((shortcutRow) =>
      row(shortcutRow.label, shortcutButton(shortcutRow)),
    );

    const apiKeyRow = row(
      "API key",
      el("div", { class: "pe-input-group" }, [keyInput, revealButton]),
      draft.aiApiKey ? "Stored locally, sent only to your endpoint" : "Required for AI explain and answer",
    );
    keyRowRef = apiKeyRow;

    return [
      el("section", { class: "pe-section" }, [
        el("div", { class: "pe-section-title", text: "Languages" }),
        languageRow,
        translationRow,
      ]),
      el("section", { class: "pe-section" }, [
        el("div", { class: "pe-section-title", text: "AI platform" }),
        row("Platform", platformSelect),
        row("API base URL", baseUrlInput, "Usually ends with /v1"),
        row("Model", modelInput),
        apiKeyRow,
        row("Read images", visionToggle, "Needs a vision capable model"),
      ]),
      el("section", { class: "pe-section" }, [
        el("div", { class: "pe-section-title", text: "Keyboard shortcuts" }),
        ...shortcutRows,
        el("p", {
          class: "pe-section-note",
          text: "Select something in the PDF, then press the shortcut. A single modifier key such as Shift can be used too.",
        }),
        warning,
      ]),
    ];
  };

  const refreshBody = () => {
    recorderCleanup?.();
    modalBody.replaceChildren(...buildBody());
  };

  const saveButton = el(
    "button",
    {
      class: "pe-btn pe-btn-primary",
      type: "button",
      onclick: async () => {
        saveButton.disabled = true;
        try {
          await onSave(cloneSettings(draft));
          close();
        } catch (error) {
          showWarning(String(error?.message || error));
          saveButton.disabled = false;
        }
      },
    },
    ["Save"],
  );

  const modal = el("div", { class: "pe-modal", role: "dialog", "aria-modal": "true" }, [
    el("header", { class: "pe-modal-header" }, [
      el("div", {}, [
        el("h2", { class: "pe-modal-title", text: "Settings" }),
        el("p", {
          class: "pe-modal-subtitle",
          text: "Languages, AI provider and the keys that trigger each action.",
        }),
      ]),
      el(
        "button",
        { class: "pe-icon-btn", type: "button", title: "Close", onclick: () => close() },
        [icon("close", { size: 16 })],
      ),
    ]),
    modalBody,
    el("footer", { class: "pe-modal-footer" }, [
      el(
        "button",
        {
          class: "pe-btn pe-btn-ghost",
          type: "button",
          onclick: () => {
            Object.assign(draft, cloneSettings(DEFAULT_SETTINGS));
            refreshBody();
            showWarning("");
          },
        },
        ["Reset to defaults"],
      ),
      el("div", { class: "pe-spacer" }),
      el("button", { class: "pe-btn pe-btn-ghost", type: "button", onclick: () => close() }, ["Cancel"]),
      saveButton,
    ]),
  ]);

  const overlay = el("div", { class: "pe-overlay" }, [modal]);
  overlay.addEventListener("pointerdown", (event) => {
    if (event.target === overlay) {
      close();
    }
  });

  function onOverlayKeyDown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (recorderCleanup) {
        recorderCleanup();
      } else {
        close();
      }
    }
  }

  refreshBody();
  document.body.append(overlay);
  document.documentElement.setAttribute("data-pe-hotkeys-paused", "");
  document.addEventListener("keydown", onOverlayKeyDown, true);

  // Without a key the dialog opens on that field, so the first thing a new
  // user sees is where their credentials go.
  if (focusApiKey || !draft.aiApiKey) {
    requestAnimationFrame(() => {
      keyInputRef?.classList.add("pe-attention");
      keyRowRef?.scrollIntoView({ block: "center" });
      keyInputRef?.focus({ preventScroll: true });
      keyInputRef?.select();
    });
  } else {
    saveButton.focus();
  }

  return { close };
}
