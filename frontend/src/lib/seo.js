/* Balises SEO par page (titre, description, canonical, Open Graph, robots).
   Les balises existent déjà dans public/index.html : on les met à jour au lieu d'en ajouter
   (React 19 ajouterait des doublons), puis on remet les valeurs par défaut en quittant la page. */
import { useEffect } from "react";

const SITE_NAME = "Hive";
const DESCRIPTION_MAX = 160;

/* Clé → [sélecteur, attribut modifié]. Les valeurs par défaut sont lues une fois dans index.html. */
const TAGS = {
  description: ['meta[name="description"]', "content"],
  ogTitle: ['meta[property="og:title"]', "content"],
  ogDescription: ['meta[property="og:description"]', "content"],
  ogUrl: ['meta[property="og:url"]', "content"],
  twitterTitle: ['meta[name="twitter:title"]', "content"],
  twitterDescription: ['meta[name="twitter:description"]', "content"],
  robots: ['meta[name="robots"]', "content"],
  canonical: ['link[rel="canonical"]', "href"],
};

let defaults = null;
function readDefaults() {
  if (defaults) return defaults;
  defaults = { title: document.title };
  for (const [key, [selector, attr]] of Object.entries(TAGS)) {
    defaults[key] = document.head.querySelector(selector)?.getAttribute(attr) ?? null;
  }
  return defaults;
}

function setTag(key, value) {
  const [selector, attr] = TAGS[key];
  const el = document.head.querySelector(selector);
  if (el && value != null) el.setAttribute(attr, value);
}

/* Texte libre → une ligne de 160 caractères max, coupée sur un mot */
export function toMetaDescription(text) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (clean.length <= DESCRIPTION_MAX) return clean;
  const cut = clean.slice(0, DESCRIPTION_MAX - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${lastSpace > 80 ? cut.slice(0, lastSpace) : cut}…`;
}

/* useSeo({ title, description, path, noindex })
   - title : sans le suffixe « — Hive » (ajouté ici) ; vide = titre par défaut
   - path : chemin canonique (« /projects/123 ») ; absent = l'URL courante sans paramètres */
export function useSeo({ title, description, path, noindex = false } = {}) {
  useEffect(() => {
    const base = readDefaults();
    const fullTitle = title ? `${title} — ${SITE_NAME}` : base.title;
    const desc = description ? toMetaDescription(description) : base.description;
    const url = `${window.location.origin}${path || window.location.pathname}`;

    document.title = fullTitle;
    setTag("description", desc);
    setTag("ogTitle", fullTitle);
    setTag("ogDescription", desc);
    setTag("twitterTitle", fullTitle);
    setTag("twitterDescription", desc);
    setTag("ogUrl", url);
    setTag("canonical", url);
    setTag("robots", noindex ? "noindex, nofollow" : base.robots);

    return () => {
      document.title = base.title;
      for (const key of Object.keys(TAGS)) setTag(key, base[key]);
    };
  }, [title, description, path, noindex]);
}
