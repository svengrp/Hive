/* Sécurité transverse : routes protégées, droits admin, compte supprimé, profil (mass assignment,
   avatar, longueurs), données exposées, en-têtes, CORS, taille des requêtes, métriques, export RGPD. */
const test = require('node:test');
const assert = require('node:assert');
const jwt = require('jsonwebtoken');
const { skip, startServer, client, signUp, projectPayload, JWT_SECRET, PASSWORD } = require('./helpers');

const PROTECTED = [
  ['get', '/auth/me'], ['get', '/projects/mine'], ['get', '/projects/recommended'], ['post', '/projects/create'],
  ['put', '/projects/000000000000000000000000'], ['delete', '/projects/000000000000000000000000'],
  ['post', '/projects/000000000000000000000000/rate'], ['get', '/messages/conversations'], ['get', '/messages/unread'],
  ['get', '/messages/group/mine'], ['post', '/messages/block/000000000000000000000000'], ['get', '/messages/notifications'],
  ['post', '/requests/000000000000000000000000'], ['put', '/user/profile'], ['put', '/user/password'],
  ['get', '/user/me/export'], ['delete', '/user/me'], ['get', '/workspace/000000000000000000000000'],
  ['get', '/billing/me'], ['post', '/billing/portal'], ['get', '/admin/users'],
];

test('sécurité', { skip }, async (t) => {
  const server = await startServer('security');
  t.after(() => server.stop());
  const [lea, max] = await Promise.all(['lea', 'max'].map((n) => signUp(server, n)));
  const anon = client(server.url);

  await t.test('toutes les routes protégées exigent un jeton', async () => {
    for (const [method, path] of PROTECTED) {
      const res = await anon[method === 'delete' ? 'del' : method](path, method === 'get' ? undefined : {});
      assert.strictEqual(res.status, 401, `${method.toUpperCase()} ${path} → ${res.status}`);
    }
  });

  await t.test('jeton signé avec un autre secret, ou expiré', async () => {
    const forged = jwt.sign({ id: lea.id, role: 'admin' }, 'mauvais-secret');
    assert.strictEqual((await client(server.url, forged).get('/admin/users')).status, 401);
    const expired = jwt.sign({ id: lea.id, role: 'user' }, JWT_SECRET, { expiresIn: -10 });
    assert.strictEqual((await client(server.url, expired).get('/auth/me')).status, 401);
  });

  await t.test('administration : utilisateur refusé, admin rétrogradé refusé', async () => {
    assert.strictEqual((await lea.api.get('/admin/users')).status, 403);
    await server.db.collection('users').updateOne({ email: max.email }, { $set: { role: 'admin' } });
    const login = await client(server.url).post('/auth/login', { email: max.email, password: PASSWORD });
    const adminApi = client(server.url, login.body.token);
    const users = await adminApi.get('/admin/users');
    assert.strictEqual(users.status, 200);
    assert.ok(users.body.every((u) => !('passwordHash' in u)));
    await server.db.collection('users').updateOne({ email: max.email }, { $set: { role: 'user' } });
    const after = await adminApi.get('/admin/users');
    assert.strictEqual(after.status, 403, `admin rétrogradé garde ses droits (jeton) : ${after.status}`);
  });

  await t.test('profil : champs protégés non modifiables, valeurs validées', async () => {
    const res = await lea.api.put('/user/profile', {
      role: 'admin', plan: 'plus', boostCredits: 99, emailVerified: false, email: 'autre@x.ch', reputation: { score: 5, votes: 1000 },
    });
    assert.strictEqual(res.status, 200);
    const me = (await lea.api.get('/auth/me')).body.user;
    assert.strictEqual(me.role, 'user');
    assert.strictEqual(me.plan, 'free');
    assert.strictEqual(me.boostCredits, 0);
    assert.strictEqual(me.email, lea.email);
    assert.strictEqual(me.reputation.votes, 0);
    assert.ok(!('passwordHash' in res.body));

    const checks = [
      [{ avatarUrl: 'javascript:alert(1)' }, 'avatar javascript:'],
      [{ avatarUrl: `data:image/png;base64,${'A'.repeat(400000)}` }, 'avatar de 300 Ko'],
      [{ avatarUrl: 'data:image/svg+xml;base64,PHN2Zz4=' }, 'avatar SVG'],
      [{ bio: 'x'.repeat(10000) }, 'bio de 10 000 caractères'],
      [{ displayName: 'x'.repeat(500) }, 'nom de 500 caractères'],
      [{ skills: Array.from({ length: 1000 }, (_, i) => `s${i}`) }, '1000 compétences'],
      [{ age: -5 }, 'âge négatif'],
      [{ age: 400 }, 'âge 400'],
    ];
    for (const [body, label] of checks) {
      const r = await lea.api.put('/user/profile', body);
      assert.strictEqual(r.status, 400, `${label} → ${r.status}`);
    }
    const ok = await lea.api.put('/user/profile', { avatarUrl: 'https://images.example.com/a.jpg', bio: 'Bonjour', age: 30 });
    assert.strictEqual(ok.status, 200);
  });

  await t.test('profil public : aucune donnée privée', async () => {
    await lea.api.put('/user/profile', { phone: '+41 79 000 00 00', address: { street: 'Rue Secrète 1', city: 'Lausanne', country: 'Suisse', postalCode: '1000' } });
    const pub = await anon.get(`/user/${lea.id}`);
    assert.strictEqual(pub.status, 200);
    const text = JSON.stringify(pub.body);
    for (const secret of [lea.email, '+41 79', 'Rue Secrète', '1000', 'passwordHash']) {
      assert.ok(!text.includes(secret), `profil public expose ${secret}`);
    }
    assert.strictEqual(pub.body.address.city, 'Lausanne');
  });

  await t.test('compte supprimé : son jeton ne fonctionne plus', async () => {
    const tmp = await signUp(server, 'temp');
    await tmp.api.post('/projects/create', projectPayload({ title: 'Projet éphémère' }));
    assert.strictEqual((await tmp.api.del('/user/me', { password: 'Mauvais.1' })).status, 403);
    assert.strictEqual((await tmp.api.del('/user/me', { password: PASSWORD })).status, 200);
    const reuse = await tmp.api.post('/projects/create', projectPayload({ title: 'Projet fantôme' }));
    assert.strictEqual(reuse.status, 401, `un compte supprimé peut encore créer un projet : ${reuse.status}`);
    assert.strictEqual((await tmp.api.get('/auth/me')).status, 401);
    const ghosts = await server.db.collection('projects').countDocuments({ title: 'Projet fantôme' });
    assert.strictEqual(ghosts, 0);
  });

  await t.test('export RGPD sans secrets', async () => {
    const res = await lea.api.get('/user/me/export');
    assert.strictEqual(res.status, 200);
    const text = JSON.stringify(res.body);
    for (const field of ['passwordHash', 'resetCodeHash', 'emailVerificationCodeHash']) assert.ok(!text.includes(field));
  });

  await t.test('erreurs : JSON propre, jamais de trace serveur', async () => {
    const broken = await fetch(`${server.url}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"email": ' });
    assert.strictEqual(broken.status, 400);
    const text = await broken.text();
    assert.ok(!/at \w+ \(|node_modules|SyntaxError: /.test(text), `trace exposée : ${text.slice(0, 120)}`);
    const huge = await fetch(`${server.url}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'x'.repeat(6 * 1024 * 1024) }) });
    assert.strictEqual(huge.status, 413);
    const notFound = await anon.get('/route-inexistante');
    assert.strictEqual(notFound.status, 404);
  });

  await t.test('en-têtes de sécurité et CORS', async () => {
    const res = await fetch(`${server.url}/api/projects/tags`, { headers: { Origin: 'https://evil.example' } });
    assert.ok(res.headers.get('x-content-type-options'));
    assert.ok(res.headers.get('strict-transport-security') || res.headers.get('content-security-policy'));
    assert.ok(!res.headers.get('x-powered-by'), 'X-Powered-By révèle Express');
    assert.notStrictEqual(res.headers.get('access-control-allow-origin'), 'https://evil.example');
    assert.notStrictEqual(res.headers.get('access-control-allow-origin'), '*');
  });

  await t.test('métriques internes non publiques', async () => {
    // En production, toute requête publique arrive par le proxy (Cloudflare + Render)
    const viaProxy = await fetch(`${server.url}/metrics`, { headers: { 'X-Forwarded-For': '203.0.113.7', 'CF-Connecting-IP': '203.0.113.7' } });
    assert.ok([401, 403, 404].includes(viaProxy.status), `/metrics public : ${viaProxy.status}`);
    // Le Prometheus interne (réseau privé, sans proxy) garde l'accès
    const internal = await fetch(`${server.url}/metrics`);
    assert.strictEqual(internal.status, 200);
  });
});
