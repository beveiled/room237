"use client";

import { useRoom237 } from "@/lib/stores";
import type { Language } from "@/lib/stores/types";
import {
  fallbackLanguage,
  supportedLanguages,
  translations,
  type TranslationValue,
} from "./translations";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type PropsWithChildren,
} from "react";

type TranslateOptions = {
  count?: number;
  values?: Record<string, string | number>;
  defaultValue?: string;
};

type I18nContextValue = {
  language: Language;
  t: (key: string, options?: TranslateOptions) => string;
  setLanguage: (language: Language) => void;
};

const I18nContext = createContext<I18nContextValue>({
  language: fallbackLanguage,
  t: (key, options) => options?.defaultValue ?? key,
  setLanguage: () => undefined,
});

const pluralRulesByLang: Record<Language, Intl.PluralRules> = {
  en: new Intl.PluralRules("en", { type: "cardinal" }),
  ru: new Intl.PluralRules("ru", { type: "cardinal" }),
};

const interpolate = (
  template: string,
  values: Record<string, string | number> | undefined,
) =>
  template.replace(/{{(.*?)}}/g, (_, rawKey: string) => {
    const key = rawKey.trim();
    const value = values?.[key];
    return value === undefined || value === null ? "" : String(value);
  });

const resolveTranslation = (
  language: Language,
  key: string,
): TranslationValue | undefined => {
  const dict = translations[language] ?? translations[fallbackLanguage];
  return dict[key] ?? translations[fallbackLanguage][key];
};

const selectPluralForm = (
  language: Language,
  value: TranslationValue,
  count?: number,
) => {
  if (typeof value === "string") return value;
  if (count === undefined) return value.other ?? value.one ?? "";

  const rule = pluralRulesByLang[language].select(count);
  return (
    value[rule as keyof TranslationValue] ?? value.other ?? value.one ?? ""
  );
};

export function translate(
  language: Language,
  key: string,
  options?: TranslateOptions,
): string {
  const values =
    options?.count !== undefined
      ? { count: options.count, ...(options?.values ?? {}) }
      : options?.values;
  const value = resolveTranslation(language, key);
  const defaultValue = options?.defaultValue ?? key;
  if (!value) {
    return defaultValue;
  }

  const text = selectPluralForm(language, value, options?.count);
  return interpolate(text || defaultValue, values);
}

export function I18nProvider({ children }: PropsWithChildren) {
  const language = useRoom237((state) => state.language);
  const setLanguage = useRoom237((state) => state.setLanguage);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const value = useMemo(
    () => ({
      language,
      setLanguage,
      t: (key: string, options?: TranslateOptions) =>
        translate(language, key, options),
    }),
    [language, setLanguage],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}

export const languageOptions: {
  value: Language;
  label: TranslationValue | undefined;
}[] = supportedLanguages.map((value) => ({
  value,
  label:
    translations[value]?.[`language.${value}`] ??
    translations[fallbackLanguage][`language.${value}`],
}));
