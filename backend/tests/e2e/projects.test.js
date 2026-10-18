/* Projets : création, validations, liste/filtres, détail, modification, suppression, couverture. */
const test = require('node:test');
const assert = require('node:assert');
const { Types } = require('mongoose');
const { skip, startServer, client, signUp, projectPayload } = require('./helpers');

// PNG 1×1 valide
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

test('projets', { skip }, async (t) => {
  const server = await startServer('projects');
  t.after(() => server.stop());
  const owner = await signUp(server, 'owner');
  const other = await signUp(server, 'other');
  const anon = client(server.url);

  await t.test('création : authentification et validations', async () => {
    assert.strictEqual((await anon.post('/projects/create', projectPayload())).status, 401);
    const cases = [
      [{ title: '' }, 'titre vide'],
      [{ projectMeta: { city: '', region: 'Suisse', startDate: '2030-01-01' } }, 'ville vide'],
      [{ projectMeta: { city: 'Genève', region: 'Suisse', startDate: '2001-01-01' } }, 'date passée'],
      [{ projectMeta: { city: 'Genève', region: 'Suisse', startDate: '2030-01-10', endDate: '2030-01-01' } }, 'fin avant début'],
      [{ location: { coordinates: ['a', 'b'] } }, 'coordonnées invalides'],
      [{ minAge: 30, maxAge: 18 }, 'âges inversés'],
      [{ title: 'x'.repeat(5000) }, 'titre de 5000 caractères'],
      [{ description: 'x'.repeat(50000) }, 'description de 50 000 caractères'],
      [{ tags: Array.from({ length: 500 }, (_, i) => `tag${i}`) }, '500 thèmes'],
      [{ maxParticipants: -3 }, 'participants négatifs'],
      [{ location: { coordinates: [500, 500] } }, 'coordonnées hors de la Terre'],
    ];
    for (const [override, label] of cases) {
      const res = await owner.api.post('/projects/create', projectPayload(override));
      assert.strictEqual(res.status, 400, `${label} → ${res.status}`);
    }
  });

  let project;
  await t.test('création réussie, champs protégés ignorés (mass assignment)', async () => {
    const res = await owner.api.post('/projects/create', projectPayload({
      ownerId: other.id, participants: [other.id], boostedUntil: '2099-01-01', cached: { avgRating: 5, ratingCount: 99 }, coverVersion: 1,
    }));
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    project = res.body;
    assert.strictEqual(String(project.ownerId), owner.id);
    assert.deepStrictEqual(project.participants, []);
    assert.strictEqual(project.boostedUntil, null);
    assert.strictEqual(project.cached.ratingCount, 0);
    assert.strictEqual(project.coverVersion, null);
  });

  await t.test('liste publique, pagination, recherche, filtres', async () => {
    await owner.api.post('/projects/create', projectPayload({ title: 'Chorale du quartier', tags: ['musique'] }));
    const list = await anon.get('/projects?limit=12');
    assert.strictEqual(list.status, 200);
    assert.ok(list.body.items.length >= 2);
    assert.ok(list.body.items.every((p) => p.status === 'open'));
    const search = await anon.get('/projects?q=chorale&limit=12');
    assert.deepStrictEqual(search.body.items.map((p) => p.title), ['Chorale du quartier']);
    const regex = await anon.get(`/projects?q=${encodeURIComponent('(.*)+$')}&limit=12`);
    assert.strictEqual(regex.status, 200, 'recherche avec caractères spéciaux');
    const tag = await anon.get('/projects?tags=musique&limit=12');
    assert.deepStrictEqual(tag.body.items.map((p) => p.title), ['Chorale du quartier']);
    const injected = await anon.get('/projects?status[$ne]=x&limit=12');
    assert.strictEqual(injected.status, 200);
    assert.ok(injected.body.items.every((p) => p.status === 'open'), 'opérateur Mongo injecté');
    const big = await anon.get('/projects?limit=100000');
    assert.ok(big.body.items.length <= 48, 'taille de page plafonnée');
  });

  await t.test('brouillons et projets privés invisibles pour les autres', async () => {
    const draft = (await owner.api.post('/projects/create', projectPayload({ title: 'Brouillon secret', status: 'draft' }))).body;
    const hidden = (await owner.api.post('/projects/create', projectPayload({ title: 'Projet privé', visibility: 'private' }))).body;
    const leak = await other.api.get('/projects?status=draft&limit=48');
    assert.ok(!leak.body.items.some((p) => p._id === draft._id), 'brouillon d\'autrui visible via ?status=draft');
    const all = await anon.get('/projects?limit=48');
    assert.ok(!all.body.items.some((p) => p._id === hidden._id), 'projet privé listé publiquement');
    const map = await anon.get('/projects');
    assert.ok(!map.body.some((p) => p._id === hidden._id || p._id === draft._id), 'carte : privé/brouillon visibles');
    assert.strictEqual((await other.api.get(`/projects/${draft._id}`)).status, 404, 'brouillon d\'autrui lisible par son id');
    const ownerView = await owner.api.get(`/projects/${draft._id}`);
    assert.strictEqual(ownerView.status, 200, 'le créateur voit son brouillon');
    const mine = await owner.api.get('/projects/mine');
    assert.ok(mine.body.some((p) => p._id === draft._id));
  });

  await t.test('détail : données publiques seulement', async () => {
    const res = await anon.get(`/projects/${project._id}`);
    assert.strictEqual(res.status, 200);
    const ownerData = res.body.ownerId;
    for (const field of ['email', 'passwordHash', 'phone', 'blockedUsers', 'stripeCustomerId']) {
      assert.ok(!(field in ownerData), `champ du créateur exposé : ${field}`);
    }
    assert.ok(!ownerData.address?.street, 'rue du créateur exposée');
  });

  await t.test('identifiants invalides : 404 propre, jamais de trace d\'erreur', async () => {
    for (const path of ['/projects/abc', '/projects/abc/cover', '/user/abc', '/user/abc/projects']) {
      const res = await anon.get(path);
      assert.ok([400, 404].includes(res.status), `${path} → ${res.status}`);
      assert.ok(!/CastError|at \w+ \(|node_modules/.test(JSON.stringify(res.body)), `${path} : trace exposée`);
    }
    const missing = await anon.get('/projects/000000000000000000000000');
    assert.strictEqual(missing.status, 404);
  });

  await t.test('modification : réservée au créateur, fusion des métadonnées', async () => {
    assert.strictEqual((await other.api.put(`/projects/${project._id}`, { title: 'Piraté' })).status, 403);
    assert.strictEqual((await anon.put(`/projects/${project._id}`, { title: 'Piraté' })).status, 401);
    const res = await owner.api.put(`/projects/${project._id}`, { title: 'Atelier vélo — édition 2', projectMeta: { budget: 300 }, ownerId: other.id });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.title, 'Atelier vélo — édition 2');
    assert.strictEqual(res.body.projectMeta.city, 'Genève', 'ville conservée');
    assert.strictEqual(res.body.projectMeta.budget, 300);
    assert.strictEqual(String(res.body.ownerId), owner.id, 'propriétaire inchangé');
    assert.strictEqual((await owner.api.put(`/projects/${project._id}`, { status: 'hacked' })).status, 400);
    assert.strictEqual((await owner.api.put(`/projects/${project._id}`, { title: 'merde alors' })).status, 400, 'grossièreté');
  });

  await t.test('couverture : formats et signatures vérifiés', async () => {
    assert.strictEqual((await other.api.put(`/projects/${project._id}/cover`, { full: PNG, thumb: PNG })).status, 403);
    const fake = `data:image/png;base64,${Buffer.from('<svg onload=alert(1)>').toString('base64')}`;
    assert.strictEqual((await owner.api.put(`/projects/${project._id}/cover`, { full: fake, thumb: fake })).status, 400, 'faux PNG');
    const svg = `data:image/svg+xml;base64,${Buffer.from('<svg/>').toString('base64')}`;
    assert.strictEqual((await owner.api.put(`/projects/${project._id}/cover`, { full: svg, thumb: svg })).status, 400, 'SVG');
    const ok = await owner.api.put(`/projects/${project._id}/cover`, { full: PNG, thumb: PNG });
    assert.strictEqual(ok.status, 200);
    const img = await fetch(`${server.url}/api/projects/${project._id}/cover?size=thumb`);
    assert.strictEqual(img.status, 200);
    assert.strictEqual(img.headers.get('content-type'), 'image/png');
    assert.strictEqual((await owner.api.del(`/projects/${project._id}/cover`)).status, 200);
  });

  await t.test('suppression : réservée au créateur, tout est nettoyé', async () => {
    const p = (await owner.api.post('/projects/create', projectPayload({ title: 'À supprimer' }))).body;
    const reqRes = await other.api.post(`/requests/${p._id}`, { message: 'Je viens' });
    assert.strictEqual(reqRes.status, 201);
    const accept = await owner.api.put(`/requests/${reqRes.body._id}/accept`);
    assert.strictEqual(accept.status, 200);
    const convId = String(accept.body.conversationId);

    assert.strictEqual((await other.api.del(`/projects/${p._id}`)).status, 403);
    assert.strictEqual((await owner.api.del(`/projects/${p._id}`)).status, 200);
    assert.strictEqual((await anon.get(`/projects/${p._id}`)).status, 404);

    const conv = await server.db.collection('conversations').findOne({ projectId: new Types.ObjectId(p._id) });
    assert.strictEqual(conv, null, 'conversation de groupe orpheline après suppression du projet');
    const msgs = await server.db.collection('messages').countDocuments({ conversationId: new Types.ObjectId(convId) });
    assert.strictEqual(msgs, 0, 'messages orphelins');
    const groups = await other.api.get('/messages/group/mine');
    assert.ok(!groups.body.some((g) => g.conversation._id === convId), 'le groupe reste dans la messagerie du membre');
  });

  await t.test('thèmes et régions', async () => {
    const tags = await anon.get('/projects/tags?popular=5');
    assert.strictEqual(tags.status, 200);
    assert.ok(Array.isArray(tags.body));
    const regions = await anon.get('/projects/regions');
    assert.ok(regions.body.includes('Suisse'));
  });
});
