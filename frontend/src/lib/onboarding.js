import { api } from "./api";
import { cleanInterests } from "./interests";

/* Parcours de bienvenue : réponses gardées dans le navigateur jusqu'à la création
   du compte, puis envoyées une seule fois au serveur (PUT /user/onboarding). */
const STORAGE_KEY = "hive-onboarding";

/* Étapes affichées. Arriver sur Hive est déjà un premier pas : la progression démarre
   à 10 % et non à 0 %, et l'écran final annonce un profil prêt à 90 % (le compte
   fait les 10 % restants). */
export const STEPS = ["name", "interests", "location", "goal", "account"];
export const STEP_PROGRESS = { name: 10, interests: 30, location: 50, goal: 70, account: 90 };
export const MAX_NAME_LENGTH = 40;

export const GOALS = ["join", "launch", "both"];

const EMPTY = {
  status: "pending", step: "name", firstName: "", interests: [], country: "", city: "", goal: null, view: null, synced: false,
};

// Vue de carte [lat, lng, zoom] trouvée à l'écran final, reprise par la carte de l'accueil
const isView = (value) => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);

// Prévient l'accueil quand les réponses changent (même onglet)
export const ONBOARDING_EVENT = "hive:onboarding";

export function readOnboarding() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (!saved || typeof saved !== "object") return { ...EMPTY };
    return {
      ...EMPTY,
      ...saved,
      step: STEPS.includes(saved.step) ? saved.step : "name",
      firstName: typeof saved.firstName === "string" ? saved.firstName.slice(0, MAX_NAME_LENGTH) : "",
      interests: cleanInterests(saved.interests),
      goal: GOALS.includes(saved.goal) ? saved.goal : null,
      view: isView(saved.view) ? saved.view : null,
    };
  } catch {
    return { ...EMPTY };
  }
}

export function writeOnboarding(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Navigation privée ou stockage bloqué : le parcours reste utilisable, sans mémoire.
  }
  window.dispatchEvent(new Event(ONBOARDING_EVENT));
}

/* Centres d'intérêt à utiliser pour « Pour toi » : ceux du compte une fois connecté,
   sinon ceux choisis pendant le parcours (gardés dans le navigateur). */
export function myInterests(user) {
  if (user) return cleanInterests(user.interests);
  return readOnboarding().interests;
}

/* Visiteur déjà passé par le parcours (terminé ou mis de côté) et qui a répondu à
   quelque chose : l'accueil lui parle directement au lieu de lui présenter Hive. */
export function isKnownVisitor(state) {
  return state.status !== "pending" && hasAnswers(state);
}

export function countryName(code, language) {
  if (!code) return "";
  try {
    return new Intl.DisplayNames([language], { type: "region" }).of(code) || code;
  } catch {
    return code;
  }
}

/* Envoie les réponses du parcours au compte qui vient de se connecter, une seule fois.
   Appelé pendant la connexion, avant d'ouvrir le profil : la page Profil charge donc
   des données déjà complètes. Renvoie le compte mis à jour, ou null s'il n'y avait rien
   à envoyer. Un seul envoi à la fois, même si plusieurs appels arrivent ensemble. */
let pendingSync = null;

export function syncOnboarding(language = document.documentElement.lang || "fr") {
  const state = readOnboarding();
  if (state.synced || !hasAnswers(state)) return Promise.resolve(null);
  if (pendingSync) return pendingSync;

  pendingSync = api("/user/onboarding", {
    method: "PUT",
    body: JSON.stringify({
      firstName: state.firstName.trim(),
      interests: state.interests,
      country: countryName(state.country, language),
      city: state.city.trim(),
      goal: state.goal,
    }),
  })
    .then((saved) => {
      if (!saved) return null;
      const current = readOnboarding();
      writeOnboarding({ ...current, synced: true, status: current.status === "pending" ? "done" : current.status });
      return saved;
    })
    .finally(() => { pendingSync = null; });
  return pendingSync;
}

/* Des réponses à envoyer au serveur une fois connecté ? */
export function hasAnswers(state) {
  return Boolean(state.firstName.trim()) || state.interests.length > 0 || Boolean(state.country) || Boolean(state.goal);
}

const BOT_PATTERN = /bot|crawl|spider|slurp|lighthouse|preview|facebookexternalhit|embedly|quora|whatsapp|telegram/i;

/* Affiché aux nouveaux visiteurs seulement, à l'arrivée sur l'accueil ou les projets :
   jamais aux robots (référencement), ni sur un lien direct (projet, profil, pages légales). */
export function shouldShowOnboarding({ user, pathname, state }) {
  if (user || state.status !== "pending") return false;
  if (!["/", "/projects"].includes(pathname)) return false;
  return !BOT_PATTERN.test(navigator.userAgent || "");
}

/* ---------- Pays ---------- */

// Hive vise la Suisse : elle seule est mise en avant, les autres pays restent au choix.
// (Mettre en avant des pays de l'UE serait un signe de ciblage au sens du RGPD.)
const PRIORITY_COUNTRIES = ["CH"];
// Codes de région qui ne sont pas des pays.
const NOT_COUNTRIES = new Set(["EU", "EZ", "UN", "QO", "XA", "XB", "ZZ", "AC", "CP", "DG", "EA", "IC", "TA", "CQ"]);

/* Liste des pays dans la langue de l'interface : { priority, others }, triés par nom. */
export function getCountries(language) {
  let names;
  try {
    names = new Intl.DisplayNames([language], { type: "region", fallback: "none" });
  } catch {
    names = null;
  }
  const label = (code) => names?.of(code) || code;
  const priority = PRIORITY_COUNTRIES.map((code) => ({ code, name: label(code) }));
  if (!names) return { priority, others: [] };

  const others = [];
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  for (const a of letters) {
    for (const b of letters) {
      const code = a + b;
      if (NOT_COUNTRIES.has(code) || PRIORITY_COUNTRIES.includes(code)) continue;
      const name = names.of(code);
      if (name && name !== code) others.push({ code, name });
    }
  }
  others.sort((x, y) => x.name.localeCompare(y.name, language));
  return { priority, others };
}

// Pays proposé d'office à l'étape Localisation
export const DEFAULT_COUNTRY = "CH";

/* ---------- Écran final : où centrer la carte ---------- */

// Repli sans réseau : centre et zoom des pays proposés en premier.
const COUNTRY_VIEWS = {
  CH: [46.8, 8.23, 7], FR: [46.6, 2.4, 5], DE: [51.1, 10.4, 5], IT: [42.8, 12.5, 5],
  AT: [47.6, 14.1, 6], LI: [47.16, 9.55, 10], BE: [50.6, 4.6, 7], LU: [49.8, 6.1, 8],
};
export const START_VIEW = [47.5, 9.5, 4];

/* Ville (ou pays) → [lat, lng, zoom]. Nominatim, comme à la création d'un projet ;
   seuls la ville et le pays partent, rien d'autre. Délai court : passé 2,5 s, on
   se contente du pays. */
export async function locatePlace({ city, countryCode, countryLabel }) {
  const fallback = COUNTRY_VIEWS[countryCode] || COUNTRY_VIEWS.CH;
  const query = city.trim()
    ? `q=${encodeURIComponent([city.trim(), countryLabel].filter(Boolean).join(", "))}`
    : countryLabel ? `country=${encodeURIComponent(countryLabel)}` : "";
  if (!query) return fallback;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&${query}`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    const [place] = await response.json();
    const lat = Number(place?.lat);
    const lng = Number(place?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return fallback;
    return [lat, lng, city.trim() ? 11 : fallback[2]];
  } catch {
    return fallback;
  } finally {
    clearTimeout(timer);
  }
}
