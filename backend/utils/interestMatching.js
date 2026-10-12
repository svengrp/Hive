/* Rapprochement entre les centres d'intérêt d'une personne (liste fermée, voir
   interests.js) et les projets, dont les thèmes sont libres. Chaque centre d'intérêt
   a une liste de mots-clés (FR et EN) cherchés dans le titre, les thèmes et les
   compétences recherchées du projet ; la description n'est pas lue (trop de bruit).

   Un mot-clé est un mot entier, sauf s'il finit par « * » : il couvre alors tout mot
   qui commence ainsi (« développ* » → développeur, développement…). Accents et
   majuscules sont ignorés. Les mots trop courts ou trop courants restent entiers
   (« jeu » ne doit pas trouver « jeune », « roman » ne doit pas trouver « romand »). */
const { INTEREST_KEYS } = require('./interests');

const INTEREST_KEYWORDS = {
  tech: [
    'tech', 'technologie*', 'technology', 'dev', 'développ*', 'develop*', 'code', 'coding', 'codeur*', 'program*',
    'informati*', 'logiciel*', 'software', 'web', 'app', 'apps', 'application mobile', 'data', 'données', 'ia', 'ai',
    'intelligence artificielle', 'python', 'javascript', 'react', 'hackathon*', 'open source', 'robot*', 'arduino',
    'électroni*', 'iot', 'numérique', 'digital', 'cyber*', 'blockchain',
  ],
  design: [
    'design*', 'graphis*', 'graphique', 'ui', 'ux', 'logo*', 'branding', 'identité visuelle', 'figma', 'typograph*',
    'maquette*', 'mode', 'fashion', 'stylisme', 'couture', 'architect*', 'décoration', 'décor',
  ],
  business: [
    'entrepren*', 'startup*', 'start-up*', 'business', 'entreprise*', 'commerce', 'e-commerce', 'vente', 'ventes',
    'finance*', 'gestion', 'management', 'freelance*', 'économi*', 'investiss*', 'levée de fonds',
  ],
  marketing: [
    'marketing', 'communication', 'com', 'réseaux sociaux', 'social media', 'seo', 'publicité', 'pub',
    'community manag*', 'influence*', 'newsletter*', 'relations publiques', 'contenu', 'content',
  ],
  music: [
    'musique*', 'music*', 'musicien*', 'chant', 'chanteu*', 'chanson*', 'singing', 'singer*', 'chorale*', 'choir',
    'band', 'groupe de musique', 'concert*', 'piano', 'guitar*', 'guitare*', 'batterie', 'dj', 'rap', 'jazz', 'rock',
    'orchestre*', 'orchestra*', 'composit*', 'beatmak*', 'podcast*',
  ],
  video: [
    'vidéo*', 'video*', 'film*', 'cinéma*', 'cinema*', 'court-métrage*', 'court métrage*', 'montage', 'youtube*',
    'tournage*', 'réalisat*', 'documentaire*', 'clip', 'clips', 'motion design', 'streaming',
  ],
  photo: ['photo*', 'photograph*'],
  games: [
    'jeu', 'jeux', 'game', 'games', 'gaming', 'gamer*', 'e-sport*', 'esport*', 'échecs', 'chess', 'jeux de rôle',
    'jdr', 'jeu de société', 'jeux de société', 'board game*', 'unity', 'godot',
  ],
  art: [
    'art', 'arts', 'artist*', 'artisan*', 'peinture*', 'peintre*', 'painting', 'dessin*', 'drawing', 'illustrat*',
    'sculpt*', 'céramique*', 'poterie', 'théâtre*', 'theatre*', 'theater', 'danse*', 'dance*', 'spectacle*',
    'culture*', 'cultural', 'exposition*', 'street art', 'graffiti', 'création*', 'atelier créatif',
  ],
  writing: [
    'écriture*', 'écrire', 'écrivain*', 'writing', 'writer*', 'blog*', 'journalis*', 'rédaction*', 'roman', 'romans',
    'novel*', 'poésie*', 'poème*', 'poetry', 'slam', 'édition*', 'livre*', 'lecture*', 'book*', 'bd', 'fanzine*',
  ],
  education: [
    'éducation*', 'education*', 'enseign*', 'cours', 'formation*', 'tutorat', 'soutien scolaire', 'école*',
    'school*', 'étudiant*', 'student*', 'apprentissage*', 'mentor*', 'pédagog*', 'teaching', 'tutoring', 'stem',
  ],
  science: [
    'science*', 'scientifi*', 'recherche*', 'research*', 'astronom*', 'biolog*', 'chimie*', 'chemistry',
    'physique*', 'physics', 'maths', 'math', 'mathémat*', 'mathemat*', 'labo*', 'stem',
  ],
  environment: [
    'écolog*', 'ecolog*', 'environnement*', 'environment*', 'climat*', 'climate*', 'jardin*', 'garden*', 'potager*',
    'permaculture*', 'biodiversité*', 'biodiversity', 'nature', 'recycl*', 'zéro déchet', 'zero waste', 'durable*',
    'durabilité', 'sustainab*', 'énergie*', 'energy', 'solaire*', 'nettoyage*', 'compost*',
  ],
  social: [
    'solidarité*', 'solidaire*', 'social', 'sociale', 'sociaux', 'bénévol*', 'volunteer*', 'association*', 'asso',
    'ong', 'ngo', 'entraide*', 'communauté*', 'community', 'humanitaire*', 'inclusion*', 'migrant*', 'réfugié*',
    'seniors', 'nonprofit', 'non-profit', 'charité', 'charity',
  ],
  sport: [
    'sport*', 'football', 'foot', 'basket*', 'volley*', 'tennis', 'running', 'course à pied', 'trail', 'vélo',
    'cyclisme*', 'cycling', 'randonnée*', 'hiking', 'escalade*', 'climbing', 'alpinisme', 'ski', 'skis', 'natation*',
    'swim*', 'fitness', 'tournoi*', 'rugby', 'hockey', 'handball', 'badminton', 'muscu*', 'boxe', 'arts martiaux',
    'surf*', 'voile', 'padel', 'marathon*', 'outdoor',
  ],
  health: [
    'santé*', 'health*', 'bien-être', 'bien être', 'wellbeing', 'well-being', 'wellness', 'yoga', 'méditation*',
    'meditation*', 'pilates', 'nutrition*', 'médic*', 'medic*', 'psycholog*', 'santé mentale', 'mental health',
    'premiers secours', 'sophrolog*', 'sommeil',
  ],
  food: [
    'cuisine*', 'cooking', 'cook*', 'food*', 'gastronom*', 'pâtisserie*', 'pastry', 'boulang*', 'recette*',
    'recipe*', 'restaurant*', 'brasserie*', 'bière*', 'beer*', 'vin', 'vins', 'wine*', 'œnolog*', 'oenolog*',
    'chocolat*', 'végétarien*', 'végé', 'vegan*', 'repas', 'traiteur*', 'café', 'barbecue', 'bbq',
  ],
  events: [
    'événement*', 'évènement*', 'event*', 'événementiel', 'festival*', 'soirée*', 'fête*', 'concert*',
    'conférence*', 'conference*', 'meetup*', 'rencontre*', 'salon*', 'animation*', 'spectacle*', 'party',
  ],
};

const strip = (value) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Une lettre sans accent du mot-clé accepte ses variantes accentuées dans le texte
const ACCENT_CLASSES = {
  a: '[aàâäáã]', e: '[eéèêë]', i: '[iîïí]', o: '[oôöóõ]', u: '[uùûüú]', c: '[cç]', y: '[yÿ]', n: '[nñ]',
};
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Caractère qui fait partie d'un mot (les lettres accentuées comptent)
const WORD_CHAR = 'a-z0-9à-ÿœ';

function keywordSource(keyword) {
  const prefix = keyword.endsWith('*');
  const base = strip(prefix ? keyword.slice(0, -1) : keyword);
  const body = [...base].map((char) => ACCENT_CLASSES[char] || escapeRegex(char)).join('');
  return `(?:^|[^${WORD_CHAR}])${body}${prefix ? '' : `(?![${WORD_CHAR}])`}`;
}

// Une expression par centre d'intérêt, construite une seule fois
const INTEREST_PATTERNS = Object.fromEntries(
  Object.entries(INTEREST_KEYWORDS).map(([key, keywords]) => {
    const sources = [...new Set(keywords.map(keywordSource))];
    return [key, new RegExp(sources.join('|'), 'i')];
  })
);

/* Lit une liste de centres d'intérêt reçue en paramètre (« music,design ») :
   clés connues seulement, sans doublon, 3 au maximum. */
function parseInterestList(value) {
  const list = typeof value === 'string' ? value.split(',') : Array.isArray(value) ? value : [];
  return [...new Set(list.map((item) => String(item).trim()).filter((key) => INTEREST_KEYS.includes(key)))].slice(0, 3);
}

/* Centres d'intérêt (parmi `interests`) auxquels le projet correspond. */
function matchInterests(project, interests) {
  if (!project || !interests?.length) return [];
  const texts = [project.title, ...(project.tags || []), ...(project.requiredSkills || [])]
    .filter((text) => typeof text === 'string' && text);
  return interests.filter((key) => texts.some((text) => INTEREST_PATTERNS[key]?.test(text)));
}

/* Condition MongoDB : projets qui correspondent à au moins un des centres d'intérêt. */
function interestsQuery(interests) {
  const patterns = interests.map((key) => INTEREST_PATTERNS[key]).filter(Boolean);
  if (patterns.length === 0) return null;
  return {
    $or: patterns.flatMap((pattern) => [{ title: pattern }, { tags: pattern }, { requiredSkills: pattern }]),
  };
}

module.exports = { INTEREST_KEYWORDS, matchInterests, interestsQuery, parseInterestList };
