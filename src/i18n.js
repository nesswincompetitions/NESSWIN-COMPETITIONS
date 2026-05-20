import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// ─── User Panel Translations ─────────────────────────────────────────────────
import enUser from '@/locales/en/user.json';
import frUser from '@/locales/fr/user.json';
import esUser from '@/locales/es/user.json';

// ─── Admin Panel Translations ────────────────────────────────────────────────
import enAdmin from '@/locales/en/admin.json';
import frAdmin from '@/locales/fr/admin.json';
import esAdmin from '@/locales/es/admin.json';

// ─── Legal Pages Translations ────────────────────────────────────────────────
import enLegal from '@/locales/en/legal.json';
import frLegal from '@/locales/fr/legal.json';
import esLegal from '@/locales/es/legal.json';

// ─── Resources ───────────────────────────────────────────────────────────────
const resources = {
  en: {
    user: enUser,
    admin: enAdmin,
    legal: enLegal,
  },
  fr: {
    user: frUser,
    admin: frAdmin,
    legal: frLegal,
  },
  es: {
    user: esUser,
    admin: esAdmin,
    legal: esLegal,
  },
};

// ─── Persisted Language ──────────────────────────────────────────────────────
const savedLanguage = window.localStorage.getItem("lang") || "en";

// ─── Initialization ──────────────────────────────────────────────────────────
i18n.use(initReactI18next).init({
  resources,
  lng: savedLanguage,
  fallbackLng: "en",
  defaultNS: "user",
  ns: ["user", "admin", "legal"],
  interpolation: {
    escapeValue: false,
  },
  react: {
    useSuspense: false,
  },
});

export default i18n;
