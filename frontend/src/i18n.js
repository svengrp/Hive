import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import fr from './locales/fr/translation.json';
import en from './locales/en/translation.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      fr: { translation: fr },
      en: { translation: en },
    },
    // Français par défaut : la langue du navigateur n'est pas prise en compte, seul un
    // choix fait sur le site (bouton FR / EN, gardé dans le navigateur) ou ?lng=en
    fallbackLng: 'fr',
    supportedLngs: ['fr', 'en'],
    detection: {
      order: ['querystring', 'localStorage'],
      // Nouvelle clé : l'ancienne gardait la langue devinée du navigateur (souvent l'anglais)
      lookupLocalStorage: 'hive-lang',
      caches: ['localStorage'],
    },
    debug: false,
    interpolation: {
      escapeValue: false,
    },
  });

// Langue de la page (lecteurs d'écran, césure, traduction automatique du navigateur)
const syncHtmlLang = (lng) => { document.documentElement.lang = lng?.startsWith('en') ? 'en' : 'fr'; };
syncHtmlLang(i18n.language);
i18n.on('languageChanged', syncHtmlLang);

export default i18n;
