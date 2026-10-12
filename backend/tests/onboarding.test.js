/* Parcours de bienvenue — centres d'intérêt, pays et objectif enregistrés sur le compte.
   Lancer : npm test (Mongo simulé : aucune base requise) */
const test = require('node:test');
const assert = require('node:assert');
const User = require('../models/User');
const { saveOnboarding, updateInfos } = require('../controllers/user.controller');
const { normalizeInterests } = require('../utils/interests');

const fakeRes = () => {
  const res = { statusCode: 200, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
};

// Document Mongoose simulé : save() garde l'état, toObject() le renvoie
const fakeUser = (fields) => {
  const user = { interests: [], onboardingGoal: null, address: {}, passwordHash: 'hash', ...fields };
  user.save = async () => user;
  user.toObject = () => {
    const { save, toObject, ...plain } = user;
    return JSON.parse(JSON.stringify(plain));
  };
  return user;
};

test('normalizeInterests : clés connues seulement, sans doublon, 3 au maximum', () => {
  assert.deepStrictEqual(normalizeInterests(['tech', 'tech', 'inconnu', 'music', 'design', 'sport']), ['tech', 'music', 'design']);
  assert.strictEqual(normalizeInterests('tech'), null);
  assert.strictEqual(normalizeInterests(undefined), null);
});

test('onboarding : remplit un compte neuf et ne renvoie jamais le hash du mot de passe', async (t) => {
  const user = fakeUser({});
  t.mock.method(User, 'findById', async () => user);

  const res = fakeRes();
  await saveOnboarding({
    user: { id: 'u1' },
    body: { firstName: '  Léa ', interests: ['music', 'video', 'pirate', 'design'], country: ' Suisse ', city: 'Lausanne', goal: 'launch' },
  }, res);

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.firstName, 'Léa');
  assert.deepStrictEqual(res.body.interests, ['music', 'video', 'design']);
  assert.strictEqual(res.body.onboardingGoal, 'launch');
  assert.deepStrictEqual(res.body.address, { country: 'Suisse', city: 'Lausanne' });
  assert.ok(!('passwordHash' in res.body));
});

test("onboarding : n'écrase jamais ce que le compte a déjà", async (t) => {
  const user = fakeUser({
    firstName: 'Léa',
    interests: ['science'],
    onboardingGoal: 'join',
    address: { country: 'France', city: 'Lyon' },
  });
  t.mock.method(User, 'findById', async () => user);

  const res = fakeRes();
  await saveOnboarding({
    user: { id: 'u1' },
    body: { firstName: 'Max', interests: ['music'], country: 'Suisse', city: 'Genève', goal: 'launch' },
  }, res);

  assert.strictEqual(res.body.firstName, 'Léa');
  assert.deepStrictEqual(res.body.interests, ['science']);
  assert.strictEqual(res.body.onboardingGoal, 'join');
  assert.deepStrictEqual(res.body.address, { country: 'France', city: 'Lyon' });
});

test('onboarding : objectif inconnu ignoré', async (t) => {
  const user = fakeUser({});
  t.mock.method(User, 'findById', async () => user);

  const res = fakeRes();
  await saveOnboarding({ user: { id: 'u1' }, body: { goal: 'hack' } }, res);

  assert.strictEqual(res.body.onboardingGoal, null);
});

test("profil : les centres d'intérêt envoyés sont filtrés avant enregistrement", async (t) => {
  let saved = null;
  t.mock.method(User, 'findByIdAndUpdate', (id, data) => {
    saved = data;
    return { select: async () => ({ _id: id, ...data }) };
  });

  const res = fakeRes();
  await updateInfos({ user: { id: 'u1' }, body: { interests: ['art', 'xss<script>', 'food', 'sport', 'games'] } }, res);

  assert.strictEqual(res.statusCode, 200);
  assert.deepStrictEqual(saved.interests, ['art', 'food', 'sport']);
});

test("profil : sans champ interests, les centres d'intérêt ne sont pas touchés", async (t) => {
  let saved = null;
  t.mock.method(User, 'findByIdAndUpdate', (id, data) => {
    saved = data;
    return { select: async () => ({ _id: id, ...data }) };
  });

  await updateInfos({ user: { id: 'u1' }, body: { bio: 'Salut' } }, fakeRes());

  assert.ok(!('interests' in saved));
});
