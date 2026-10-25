/** Languages offered for AI explanations and for Google Translate. */

export const LANGUAGES = [
  { code: "zh-CN", label: "中文（简体）", short: "中文" },
  { code: "zh-TW", label: "中文（繁體）", short: "繁體中文" },
  { code: "en", label: "English", short: "English" },
  { code: "ja", label: "日本語", short: "日本語" },
  { code: "ko", label: "한국어", short: "한국어" },
  { code: "fr", label: "Français", short: "Français" },
  { code: "de", label: "Deutsch", short: "Deutsch" },
  { code: "es", label: "Español", short: "Español" },
  { code: "ru", label: "Русский", short: "Русский" },
  { code: "pt", label: "Português", short: "Português" },
  { code: "it", label: "Italiano", short: "Italiano" },
  { code: "ar", label: "العربية", short: "العربية" },
];

export function languageLabel(code, { short = false } = {}) {
  const entry = LANGUAGES.find((item) => item.code === code);
  if (!entry) {
    return code;
  }
  return short ? entry.short : entry.label;
}

/** Human readable name used inside AI prompts. */
export function languageNameForPrompt(code) {
  const names = {
    "zh-CN": "Simplified Chinese",
    "zh-TW": "Traditional Chinese",
    en: "English",
    ja: "Japanese",
    ko: "Korean",
    fr: "French",
    de: "German",
    es: "Spanish",
    ru: "Russian",
    pt: "Portuguese",
    it: "Italian",
    ar: "Arabic",
  };
  return names[code] || code;
}
