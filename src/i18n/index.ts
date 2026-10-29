import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import de from "./de.json";
import en from "./en.json";

export const LANGUAGES = ["de", "en"] as const;
export type Language = (typeof LANGUAGES)[number];

/** The OS language if we support it, otherwise English. */
export function systemLanguage(): Language {
  const tag = (navigator.languages?.[0] ?? navigator.language ?? "en").toLowerCase();
  return tag.startsWith("de") ? "de" : "en";
}

void i18n.use(initReactI18next).init({
  resources: { de: { translation: de }, en: { translation: en } },
  lng: systemLanguage(),
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export default i18n;
