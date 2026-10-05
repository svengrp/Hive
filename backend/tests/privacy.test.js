/* Vie privée (LPD / RGPD) — le profil public n'expose jamais la rue, le code postal, l'email ni le téléphone.
   Lancer : npm test (Mongo simulé : aucune base requise) */
const test = require('node:test');
const assert = require('node:assert');
const User = require('../models/User');
const { getPublicProfile } = require('../controllers/user.controller');

const fakeRes = () => {
  const res = { statusCode: 200, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
};

test('profil public : ville et pays seulement, aucune donnée de contact', async (t) => {
  t.mock.method(User, 'findById', async () => ({
    _id: '64b7f0c2a1b2c3d4e5f60718',
    displayName: 'Léa',
    email: 'lea@example.com',
    phone: '+41 79 000 00 00',
    passwordHash: 'hash',
    address: { street: 'Rue du Test 1', postalCode: '1200', city: 'Genève', country: 'Suisse' },
  }));

  const res = fakeRes();
  await getPublicProfile({ params: { id: '64b7f0c2a1b2c3d4e5f60718' } }, res);

  assert.strictEqual(res.statusCode, 200);
  assert.deepStrictEqual(res.body.address, { city: 'Genève', country: 'Suisse' });
  const json = JSON.stringify(res.body);
  for (const secret of ['Rue du Test', '1200', 'lea@example.com', '+41 79', 'hash']) {
    assert.ok(!json.includes(secret), `« ${secret} » ne doit pas être public`);
  }
});

const bcrypt = require('bcrypt');
const { deleteMyAccount, exportMyData } = require('../controllers/user.controller');

test('suppression de compte : refusée sans le bon mot de passe, refusée pour un admin', async (t) => {
  const passwordHash = await bcrypt.hash('bon-mot-de-passe', 4);
  const accounts = {
    a: { _id: 'a', role: 'user', email: 'a@example.com', passwordHash },
    g: { _id: 'g', role: 'user', email: 'g@example.com', passwordHash: null }, // compte Google/GitHub
    admin: { _id: 'admin', role: 'admin', email: 'admin@example.com', passwordHash },
  };
  t.mock.method(User, 'findById', async (id) => accounts[id]);

  const call = async (id, body) => { const res = fakeRes(); await deleteMyAccount({ user: { id }, body }, res); return res.statusCode; };
  assert.strictEqual(await call('a', { password: 'mauvais' }), 403);
  assert.strictEqual(await call('a', {}), 403);
  assert.strictEqual(await call('g', { email: 'autre@example.com' }), 403);
  assert.strictEqual(await call('admin', { password: 'bon-mot-de-passe' }), 403);
});

test('export de mes données : aucun secret (mot de passe, codes)', async (t) => {
  let selected = '';
  t.mock.method(User, 'findById', () => ({ select: (fields) => { selected = fields; return { lean: async () => ({ email: 'a@example.com' }) }; } }));
  const Project = require('../models/Project');
  const Rating = require('../models/Rating');
  const Message = require('../models/Message');
  const ProjectRequest = require('../models/ProjectRequest');
  const ProjectHistory = require('../models/ProjectHistory');
  const chain = { select: () => chain, lean: async () => [] };
  for (const Model of [Project, Rating, Message, ProjectRequest, ProjectHistory]) t.mock.method(Model, 'find', () => chain);

  const res = fakeRes();
  res.set = () => res;
  await exportMyData({ user: { id: 'a' } }, res);
  assert.strictEqual(res.statusCode, 200);
  for (const secret of ['-passwordHash', '-resetCodeHash', '-emailVerificationCodeHash', '-twoFactorCode']) {
    assert.ok(selected.includes(secret), `${secret} exclu de l'export`);
  }
  assert.strictEqual(res.body.profile.email, 'a@example.com');
});

test('inscription : refusée sans acceptation des conditions', async () => {
  const { register } = require('../controllers/auth.controller');
  const res = fakeRes();
  await register({ body: { email: 'new@example.com', password: 'Abcdef1!' } }, res);
  assert.strictEqual(res.statusCode, 400);
  assert.match(res.body.error, /conditions/);
});
