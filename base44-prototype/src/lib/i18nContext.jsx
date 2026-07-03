import React, { createContext, useContext, useState, useEffect } from 'react';
import { detectLocale, setLocale } from './i18n';
import { t } from './i18n';

const I18nContext = createContext(null);

export function I18nProvider({ children }) {
  const [locale, setLocaleState] = useState(detectLocale);

  const switchLocale = (lang) => {
    setLocaleState(lang);
    setLocale(lang);
  };

  const tr = (key) => t(key, locale);

  return (
    <I18nContext.Provider value={{ locale, switchLocale, t: tr }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}