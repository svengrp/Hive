/* Centres d'intérêt ↔ projets : mots-clés, filtre « Pour toi » et recommandations.
   Lancer : npm test (Mongo simulé : aucune base requise) */
const test = require('node:test');
const assert = require('node:assert');
const Project = require('../models/Project');
const User = require('../models/User');
const ProjectHistory = require('../models/ProjectHistory');
const { getAllProjects, getRecommended } = require('../controllers/project.controller');
const { matchInterests, parseInterestList } = require('../utils/interestMatching');

const ALL = ['tech', 'design', 'business', 'marketing', 'music', 'video', 'photo', 'games', 'art', 'writing',
  'education', 'science', 'environment', 'social', 'sport', 'health', 'food', 'events'];

const fakeRes = () => {
  const res = { statusCode: 200, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
};

// Requête Mongoose simulée : chaînable, puis attendue comme une promesse
const fakeQuery = (docs) => {
  const query = {
    populate: () => query, sort: () => query, skip: () => query, limit: () => query,
    then: (resolve, reject) => Promise.resolve(docs).then(resolve, reject),
  };
  return query;
};

const doc = (fields) => ({ ...fields, toObject: () => ({ ...fields }) });

test('mots-clés : thèmes libres, accents et majuscules ignorés', () => {
  assert.deepStrictEqual(matchInterests({ title: 'Festival de jazz', tags: ['Événementiel'] }, ALL), ['music', 'events']);
  assert.deepStrictEqual(matchInterests({ title: 'App de covoiturage', tags: ['Développement web'] }, ALL), ['tech']);
  assert.deepStrictEqual(matchInterests({ title: 'ŒNOLOGIE entre amis' }, ALL), ['food']);
  assert.deepStrictEqual(matchInterests({ title: 'Équipe', requiredSkills: ['Photographe'] }, ALL), ['photo']);
});

test('mots-clés : pas de faux amis (jeune ≠ jeu, romand ≠ roman, aide ≠ ai)', () => {
  assert.deepStrictEqual(matchInterests({ title: 'Club jeunesse romand', tags: ['Aide aux devoirs'] }, ALL), []);
  assert.deepStrictEqual(matchInterests({ title: 'Chantier du parc' }, ['music']), []);
});

test('liste reçue en paramètre : clés connues, sans doublon, 3 au maximum', () => {
  assert.deepStrictEqual(parseInterestList('music,pirate,music,design,photo,sport'), ['music', 'design', 'photo']);
  assert.deepStrictEqual(parseInterestList({ $ne: 'x' }), []);
  assert.deepStrictEqual(parseInterestList(undefined), []);
});

test('GET /projects?interests&forYou=1 : filtre sur les centres d\'intérêt et indique les correspondances', async (t) => {
  let received;
  t.mock.method(Project, 'find', (query) => {
    received = query;
    return fakeQuery([doc({ _id: 'p1', title: 'Chorale', tags: ['Musique'] }), doc({ _id: 'p2', title: 'Expo photo', tags: [] })]);
  });
  t.mock.method(Project, 'countDocuments', async () => 2);

  const res = fakeRes();
  await getAllProjects({ query: { limit: '12', interests: 'music,photo', forYou: '1' } }, res);

  const filter = received.$and.find((condition) => condition.$or?.some((c) => c.title instanceof RegExp));
  assert.ok(filter, 'condition « Pour toi » présente');
  assert.deepStrictEqual(res.body.items.map((p) => p.matchedInterests), [['music'], ['photo']]);
});

test('GET /projects sans centres d\'intérêt : réponse inchangée', async (t) => {
  t.mock.method(Project, 'find', () => fakeQuery([doc({ _id: 'p1', title: 'Chorale' })]));
  const res = fakeRes();
  await getAllProjects({ query: {} }, res);
  assert.ok(!('matchedInterests' in res.body[0]));
});

test('recommandations dès le premier jour grâce aux centres d\'intérêt, projets ouverts et visibles seulement', async (t) => {
  t.mock.method(User, 'findById', () => ({ select: async () => ({ interests: ['music', 'sport'] }) }));
  t.mock.method(ProjectHistory, 'find', () => fakeQuery([]));
  let candidateQuery;
  t.mock.method(Project, 'find', (query) => {
    candidateQuery = query;
    return fakeQuery([
      doc({ _id: 'a', title: 'Atelier cuisine', tags: ['Cuisine'] }),
      doc({ _id: 'b', title: 'Tournoi de basket', tags: ['Sport'] }),
      doc({ _id: 'c', title: 'Concert de quartier', tags: ['Musique', 'Football'] }),
    ]);
  });

  const res = fakeRes();
  await getRecommended({ user: { id: 'u1' } }, res);

  assert.strictEqual(candidateQuery.status, 'open');
  assert.deepStrictEqual(candidateQuery.visibility, { $ne: 'private' });
  assert.deepStrictEqual(res.body.map((item) => item.project._id), ['c', 'b']);
  assert.deepStrictEqual(res.body[0].project.matchedInterests, ['music', 'sport']);
});

test('recommandations : ni centres d\'intérêt ni historique → rien', async (t) => {
  t.mock.method(User, 'findById', () => ({ select: async () => ({ interests: [] }) }));
  t.mock.method(ProjectHistory, 'find', () => fakeQuery([]));
  const res = fakeRes();
  await getRecommended({ user: { id: 'u1' } }, res);
  assert.deepStrictEqual(res.body, []);
});
