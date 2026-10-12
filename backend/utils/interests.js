/* Centres d'intérêt proposés à l'arrivée sur Hive (parcours de bienvenue) et modifiables
   depuis le profil. Liste fermée : seules ces clés sont enregistrées, les libellés
   (FR/EN) vivent côté front. Garder en phase avec frontend/src/lib/interests.js. */
const INTEREST_KEYS = [
  'tech', 'design', 'business', 'marketing', 'music', 'video',
  'photo', 'games', 'art', 'writing', 'education', 'science',
  'environment', 'social', 'sport', 'health', 'food', 'events',
];

const MAX_INTERESTS = 3;

const ONBOARDING_GOALS = ['join', 'launch', 'both'];

/* Garde les clés connues, sans doublon, dans la limite autorisée. Renvoie null si
   la valeur reçue n'est pas une liste (champ absent ou invalide : on n'y touche pas). */
function normalizeInterests(value) {
  if (!Array.isArray(value)) return null;
  const unique = [...new Set(value.filter((key) => INTEREST_KEYS.includes(key)))];
  return unique.slice(0, MAX_INTERESTS);
}

module.exports = { INTEREST_KEYS, MAX_INTERESTS, ONBOARDING_GOALS, normalizeInterests };
