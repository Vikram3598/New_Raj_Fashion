"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import english from "@/i18n/en.json";
import hindi from "@/i18n/hi.json";

export type Locale = "en" | "hi";
type Messages = Record<string, string>;
type TextState = { source: string; lastApplied: string };
type AttributeState = Map<string, TextState>;
type LocaleContextValue = { locale: Locale; setLocale: (locale: Locale) => void; t: (english: string) => string };

const catalogs: Record<Locale, { locale: string; messages: Messages }> = { en: english, hi: hindi };
const LocaleContext = createContext<LocaleContextValue | null>(null);

function withWhitespace(source: string, translated: string) {
  const leading = source.match(/^\s*/)?.[0] ?? "";
  const trailing = source.match(/\s*$/)?.[0] ?? "";
  return `${leading}${translated}${trailing}`;
}

function escapeRegExp(source: string) {
  return source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function translateMessage(source: string, messages: Messages) {
  const direct = messages[source];
  if (direct) return direct;
  const fragments = new Set<string>();
  for (const [pattern, translated] of Object.entries(messages)) {
    if (!pattern.includes("{")) continue;
    const placeholders: string[] = [];
    const sourceParts = pattern.split(/(\{[\w]+\})/g);
    const translatedParts = translated.split(/(\{[\w]+\})/g);
    const expression = sourceParts.map((part) => {
      if (/^\{[\w]+\}$/.test(part)) {
        placeholders.push(part.slice(1, -1));
        return "(.+?)";
      }
      return escapeRegExp(part);
    }).join("");
    const match = source.match(new RegExp(`^${expression}$`));
    if (match) return placeholders.reduce((value, name, index) => value.replaceAll(`{${name}}`, match[index + 1]), translated);

    // Server-rendered JSX can split a phrase around interpolated values into
    // several text nodes (for example, "Page 1 of 3"). Translate its static
    // text fragments while leaving the separately rendered values intact.
    for (let index = 0; index < sourceParts.length; index += 1) {
      if (/^\{[\w]+\}$/.test(sourceParts[index])) continue;
      const sourceFragment = sourceParts[index].trim();
      const translatedFragment = translatedParts[index]?.trim();
      if (sourceFragment && sourceFragment === source && translatedFragment && translatedFragment !== sourceFragment) {
        fragments.add(translatedFragment);
      }
    }
  }
  return fragments.size === 1 ? [...fragments][0] : source;
}

export function LocaleProvider({ children, initialLocale = "en" }: { children: React.ReactNode; initialLocale?: Locale }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const textStates = useRef(new WeakMap<Text, TextState>());
  const attributeStates = useRef(new WeakMap<Element, AttributeState>());
  const messages = catalogs[locale].messages;

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try { localStorage.setItem("nrf-locale", next); } catch {}
    document.cookie = `nrf_locale=${next}; Max-Age=31536000; Path=/; SameSite=Lax`;
  }, []);

  const t = useCallback((source: string) => translateMessage(source, catalogs[locale].messages), [locale]);

  useEffect(() => {
    let stored: string | null = null;
    try { stored = localStorage.getItem("nrf-locale"); } catch {}
    const cookieLocale = document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith("nrf_locale="))?.split("=")[1];
    const preference = stored === "hi" || stored === "en" ? stored : cookieLocale;
    if (preference === "hi" || preference === "en") {
      setLocaleState(preference);
      if (cookieLocale !== preference) document.cookie = `nrf_locale=${preference}; Max-Age=31536000; Path=/; SameSite=Lax`;
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale === "hi" ? "hi-IN" : "en-IN";

    const translateText = (text: Text) => {
      if (text.parentElement?.closest("script, style, noscript")) return;
      const current = text.nodeValue ?? "";
      const previous = textStates.current.get(text);
      const state = previous && previous.lastApplied === current
        ? previous
        : { source: current, lastApplied: current };
      const trimmed = state.source.trim();
      if (!trimmed) return;
      const translated = locale === "hi" ? translateMessage(trimmed, messages) : trimmed;
      const next = withWhitespace(state.source, translated);
      if (next !== current) {
        state.lastApplied = next;
        textStates.current.set(text, state);
        text.nodeValue = next;
      } else {
        state.lastApplied = current;
        textStates.current.set(text, state);
      }
    };

    const translateAttributes = (element: Element) => {
      const known = attributeStates.current.get(element) ?? new Map<string, TextState>();
      for (const attribute of ["aria-label", "aria-description", "placeholder", "title", "alt"]) {
        const current = element.getAttribute(attribute);
        if (current === null) continue;
        const previous = known.get(attribute);
        const state = previous && previous.lastApplied === current
          ? previous
          : { source: current, lastApplied: current };
        const source = state.source.trim();
        if (!source) continue;
        const next = withWhitespace(state.source, locale === "hi" ? translateMessage(source, messages) : source);
        state.lastApplied = next;
        known.set(attribute, state);
        if (next !== current) element.setAttribute(attribute, next);
      }
      attributeStates.current.set(element, known);
    };

    const translateTree = (root: Node) => {
      if (root.nodeType === Node.TEXT_NODE) {
        translateText(root as Text);
        return;
      }
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node: Node | null;
      while ((node = walker.nextNode())) translateText(node as Text);
      if (root instanceof Element) {
        if (root.matches("[aria-label], [aria-description], [placeholder], [title], [alt]")) translateAttributes(root);
        for (const element of root.querySelectorAll("[aria-label], [aria-description], [placeholder], [title], [alt]")) translateAttributes(element);
      }
    };

    translateTree(document.body);
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === "characterData") translateText(record.target as Text);
        else if (record.type === "attributes") translateAttributes(record.target as Element);
        else for (const node of record.addedNodes) translateTree(node);
      }
    });
    observer.observe(document.body, {
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["aria-label", "aria-description", "placeholder", "title", "alt"],
      subtree: true,
    });
    return () => observer.disconnect();
  }, [locale, messages]);

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const value = useContext(LocaleContext);
  if (!value) throw new Error("useLocale must be used inside LocaleProvider");
  return value;
}

export function LocaleSwitcher({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale, t } = useLocale();
  return <div className="inline-flex rounded-full border border-stone-300 p-0.5 text-xs dark:border-stone-700" aria-label={t("Language")}>
    <button type="button" onClick={() => setLocale("en")} aria-pressed={locale === "en"} className={`rounded-full px-2 py-1 ${locale === "en" ? "bg-maroon-700 text-white" : ""}`}>{compact ? "EN" : t("English")}</button>
    <button type="button" onClick={() => setLocale("hi")} aria-pressed={locale === "hi"} className={`rounded-full px-2 py-1 ${locale === "hi" ? "bg-maroon-700 text-white" : ""}`}>{compact ? "हि" : t("हिंदी")}</button>
  </div>;
}

export function LocalizedValue({ english: englishValue, hindi: hindiValue }: { english: string; hindi?: string | null }) {
  const { locale, t } = useLocale();
  return <>{locale === "hi" && hindiValue ? hindiValue : t(englishValue)}</>;
}
