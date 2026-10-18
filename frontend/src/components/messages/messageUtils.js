/* Utilitaires de la messagerie : noms, identifiants, dates et recherche.
   Les dates passent par Intl.DateTimeFormat avec la langue active d'i18next. */

const DAY_MS = 24 * 60 * 60 * 1000;
export const GROUP_WINDOW_MS = 5 * 60 * 1000;
export const MAX_LENGTH = 2000;
export const COUNTER_FROM = 1800;

export function idOf(value) {
  if (!value) return "";
  return String(value._id || value.id || value);
}

export function getUserName(user, fallback = "Utilisateur") {
  return (
    user?.displayName ||
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
    fallback
  );
}

export function getGroupTitle(conversation, fallback) {
  return conversation?.projectTitle || conversation?.projectId?.title || fallback;
}

/* Clés de conversation : « dm-<userId> » ou « grp-<convId> » (aussi utilisées comme key React). */
export const dmKey = (userId) => `dm-${userId}`;
export const groupKey = (convId) => `grp-${convId}`;

/* Recherche insensible à la casse et aux accents */
export function normalize(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/* Nombre de jours calendaires entre la date et aujourd'hui (0 = aujourd'hui) */
export function daysAgo(date) {
  return Math.round((startOfDay(new Date()) - startOfDay(date)) / DAY_MS);
}

export function isSameDay(a, b) {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}

function capitalize(text) {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

function safeFormat(lang, options, date) {
  try {
    return new Intl.DateTimeFormat(lang || "fr", options).format(new Date(date));
  } catch {
    return new Intl.DateTimeFormat("fr", options).format(new Date(date));
  }
}

export function formatClock(date, lang) {
  if (!date) return "";
  return safeFormat(lang, { hour: "2-digit", minute: "2-digit" }, date);
}

export function formatFullDate(date, lang) {
  if (!date) return "";
  return safeFormat(lang, { dateStyle: "full", timeStyle: "short" }, date);
}

/* Heure affichée dans la liste : HH:mm, « Hier », jour de la semaine, puis jj/mm/aa */
export function formatListTime(date, lang, t) {
  if (!date) return "";
  const diff = daysAgo(date);
  if (diff <= 0) return formatClock(date, lang);
  if (diff === 1) return t("messages.yesterday");
  if (diff < 7) return capitalize(safeFormat(lang, { weekday: "long" }, date));
  return safeFormat(lang, { day: "2-digit", month: "2-digit", year: "2-digit" }, date);
}

/* Libellé des séparateurs de date dans le fil */
export function formatDayLabel(date, lang, t) {
  const diff = daysAgo(date);
  if (diff <= 0) return t("messages.today");
  if (diff === 1) return t("messages.yesterday");
  if (diff < 7) return capitalize(safeFormat(lang, { weekday: "long" }, date));
  const sameYear = new Date(date).getFullYear() === new Date().getFullYear();
  return safeFormat(
    lang,
    sameYear ? { day: "numeric", month: "long" } : { day: "numeric", month: "long", year: "numeric" },
    date
  );
}

/* Code d'erreur d'envoi à partir du texte serveur (jamais affiché tel quel) */
export function sendErrorKey(serverMessage) {
  const text = normalize(serverMessage);
  if (text.includes("inappropri")) return "messages.sendErrorContent";
  if (text.includes("cloture")) return "messages.sendErrorClosed";
  if (text.includes("tu as bloque")) return "messages.sendErrorBlocked";
  if (text.includes("pas pu etre distribue")) return "messages.sendErrorUndelivered";
  if (text.includes("n'existe plus") || text.includes("n’existe plus")) return "messages.sendErrorGone";
  if (text.includes("trop long")) return "messages.sendErrorTooLong";
  if (text.includes("patiente")) return "messages.sendErrorRate";
  return "messages.sendErrorGeneric";
}

/* Lecture sûre de matchMedia (absent sous jsdom) */
export function matches(query) {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(query).matches
    : false;
}
