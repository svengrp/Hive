import { avatarSrc } from "./avatar";
import { cleanInterests } from "./interests";

/* Profil complété : chaque élément a un poids (total 100) et un conseil.
   anchor : section de « Mon profil » où le remplir. */
const DEFAULT_BIO = "Nouvel utilisateur Hive !";

const STEPS = [
  { key: "photo", weight: 15, anchor: "profile-infos", done: (p) => !!avatarSrc(p) },
  { key: "headline", weight: 15, anchor: "profile-infos", done: (p) => !!p.headline?.trim() },
  { key: "experience", weight: 15, anchor: "profile-parcours", done: (p) => p.experiences?.length > 0 },
  { key: "bio", weight: 10, anchor: "profile-infos", done: (p) => !!p.bio?.trim() && p.bio.trim() !== DEFAULT_BIO },
  { key: "skills", weight: 10, anchor: "profile-skills", done: (p) => (p.skills?.length || 0) >= 3 },
  { key: "formation", weight: 10, anchor: "profile-parcours", done: (p) => p.formations?.length > 0 || p.education?.length > 0 },
  { key: "city", weight: 5, anchor: "profile-location", done: (p) => !!p.address?.city?.trim() },
  { key: "languages", weight: 5, anchor: "profile-skills", done: (p) => p.languages?.length > 0 },
  { key: "interests", weight: 5, anchor: "profile-interests-title", done: (p) => cleanInterests(p.interests).length > 0 },
  { key: "banner", weight: 5, anchor: "profile-presentation", done: (p) => !!p.bannerVersion },
  { key: "cv", weight: 5, anchor: "profile-presentation", done: (p) => !!p.cv?.name },
];

export function profileCompletion(profile) {
  if (!profile) return { percent: 0, missing: [] };
  const missing = STEPS.filter((s) => !s.done(profile));
  const percent = 100 - missing.reduce((n, s) => n + s.weight, 0);
  // Les conseils les plus utiles d'abord (poids le plus fort)
  return { percent, missing };
}
