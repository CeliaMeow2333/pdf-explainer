/**
 * Settings persistence.
 *
 * Inside the extension everything lives in storage.local (browser.storage on
 * Firefox, chrome.storage on Chromium). When the viewer page is opened from a
 * plain web server (handy while developing the UI) we transparently fall back
 * to localStorage.
 */

import { ext } from "./compat.js";

const STORAGE_KEY = "pdfExplainerSettings";
const SUBSCRIBERS = new Set();

export const DEFAULT_SETTINGS = {
  aiLanguage: "zh-CN",
  translateLanguage: "zh-CN",
  aiPlatform: "deepseek",
  aiBaseUrl: "https://api.deepseek.com/v1",
  aiModel: "deepseek-flash",
  // Never ship a key: the user pastes their own in Settings.
  aiApiKey: "",
  aiVision: true,
  shortcuts: {
    translate: { mods: ["shift"], code: "KeyT" },
    explain: { mods: ["shift"], code: "KeyE" },
    answer: { mods: ["shift"], code: "KeyA" },
  },
};

export const PLATFORMS = [
  { id: "deepseek", label: "DeepSeek", baseUrl: "https://api.deepseek.com/v1" },
  { id: "openai", label: "OpenAI", baseUrl: "https://api.openai.com/v1" },
  { id: "custom", label: "Custom / self-hosted", baseUrl: "" },
];

export function storageAvailable() {
  return Boolean(ext?.storage?.local);
}

export function normalizeSettings(raw = {}) {
  const merged = {
    ...DEFAULT_SETTINGS,
    ...raw,
    shortcuts: {
      ...DEFAULT_SETTINGS.shortcuts,
      ...(raw.shortcuts || {}),
    },
  };
  merged.aiBaseUrl = String(merged.aiBaseUrl || "").trim();
  merged.aiModel = String(merged.aiModel || "").trim();
  merged.aiApiKey = String(merged.aiApiKey || "").trim();
  merged.aiVision = merged.aiVision !== false;
  return merged;
}

export async function loadSettings() {
  try {
    if (storageAvailable()) {
      const stored = await ext.storage.local.get(STORAGE_KEY);
      return normalizeSettings(stored?.[STORAGE_KEY] || {});
    }
    const raw = localStorage.getItem(STORAGE_KEY);
    return normalizeSettings(raw ? JSON.parse(raw) : {});
  } catch (error) {
    console.warn("[PDF Explainer] could not read settings", error);
    return normalizeSettings();
  }
}

export async function saveSettings(settings) {
  const normalized = normalizeSettings(settings);
  if (storageAvailable()) {
    await ext.storage.local.set({ [STORAGE_KEY]: normalized });
  } else {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  }
  notify(normalized);
  return normalized;
}

export function subscribeToSettings(callback) {
  SUBSCRIBERS.add(callback);
  return () => SUBSCRIBERS.delete(callback);
}

function notify(settings) {
  for (const callback of SUBSCRIBERS) {
    try {
      callback(settings);
    } catch (error) {
      console.warn("[PDF Explainer] settings subscriber failed", error);
    }
  }
}

if (storageAvailable() && ext.storage.onChanged) {
  ext.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes[STORAGE_KEY]) {
      notify(normalizeSettings(changes[STORAGE_KEY].newValue || {}));
    }
  });
}

/** Intercept navigation injected by the background script. */
export function readViewerParams() {
  const params = new URLSearchParams(location.search);
  return {
    pdfUrl: params.get("url") || params.get("file") || "",
    openSettings: params.get("settings") === "1",
  };
}
