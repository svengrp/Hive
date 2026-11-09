/* Parcours façon CV : dates AAAA-MM (ou AAAA), fin vide = en cours. Partagé par le profil public et l'éditeur. */

const parse = (value) => {
  const m = /^(\d{4})(?:-(\d{2}))?$/.exec(value || "");
  return m ? { year: Number(m[1]), month: m[2] ? Number(m[2]) : null } : null;
};

const locale = (lang) => (lang === "en" ? "en-GB" : "fr-CH");

function formatMonth(value, lang) {
  const d = parse(value);
  if (!d) return "";
  if (!d.month) return String(d.year);
  return new Intl.DateTimeFormat(locale(lang), { month: "short", year: "numeric" }).format(new Date(d.year, d.month - 1, 1));
}

// « sept. 2024 – aujourd'hui · 1 an 3 mois »
export function formatPeriod(entry, t, lang) {
  const start = formatMonth(entry.start, lang);
  const end = entry.current ? t("cv.present") : formatMonth(entry.end, lang);
  const range = start && end ? `${start} – ${end}` : start || end;
  const length = duration(entry, t);
  return [range, length].filter(Boolean).join(" · ");
}

function duration(entry, t) {
  const a = parse(entry.start);
  if (!a?.month) return "";
  const now = new Date();
  const b = entry.current ? { year: now.getFullYear(), month: now.getMonth() + 1 } : parse(entry.end);
  if (!b?.month) return "";
  const total = (b.year - a.year) * 12 + (b.month - a.month) + 1; // mois de début et de fin compris, comme sur LinkedIn
  if (total <= 0) return "";
  const years = Math.floor(total / 12);
  const months = total % 12;
  return [years ? t("cv.years", { count: years }) : "", months ? t("cv.months", { count: months }) : ""].filter(Boolean).join(" ");
}

// En cours d'abord, puis du plus récent au plus ancien
const key = (entry) => (entry.current ? "9999-99" : entry.end || entry.start || "0000");
export const sortTimeline = (list) => [...(list || [])].sort((x, y) => key(y).localeCompare(key(x)) || (y.start || "").localeCompare(x.start || ""));

// Pastille de l'organisation : son initiale, sur une couleur stable tirée de son nom
export function orgBadge(name) {
  const clean = (name || "").trim();
  let h = 0;
  for (const c of clean) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return { letter: (clean[0] || "·").toUpperCase(), color: `var(--person-${(h % 5) + 1})` };
}

// Hôte lisible d'un lien (« linkedin.com/in/sven »)
export function linkLabel(url) {
  try {
    const u = new URL(url);
    return `${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/$/, "")}`;
  } catch {
    return url;
  }
}
