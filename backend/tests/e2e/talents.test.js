/* Recherche de talents et invitations (Hive+) : accès, opt-in, blocage, limites, accepter / refuser. */
const test = require('node:test');
const assert = require('node:assert');
const { Types } = require('mongoose');
const { skip, startServer, signUp, projectPayload, sleep } = require('./helpers');

test('talents et invitations', { skip }, async (t) => {
  const server = await startServer('talents', { DAILY_INVITES: '3' });
  t.after(() => server.stop());
  const [owner, ana, ben, cleo, dan] = await Promise.all(
    ['owner', 'ana', 'ben', 'cleo', 'dan'].map((n) => signUp(server, n, { skills: n === 'ana' ? ['Guitare', 'Chant'] : ['Design'], address: { city: n === 'ben' ? 'Lausanne' : 'Genève', country: 'Suisse' } }))
  );
  const users = server.db.collection('users');
  const setPlus = (u) => users.updateOne({ _id: new Types.ObjectId(u.id) }, { $set: { plan: 'plus', planStatus: 'active' } });
  const project = (await owner.api.post('/projects/create', projectPayload({ title: 'Groupe de musique', maxParticipants: 2 }))).body;

  await t.test('sans Hive+ : 402 avec le nombre de talents disponibles', async () => {
    await ana.api.put('/user/profile', { openToProjects: true });
    const res = await owner.api.get('/talents');
    assert.strictEqual(res.status, 402);
    assert.strictEqual(res.body.code, 'plus_required');
    assert.strictEqual(res.body.count, 1);
    assert.strictEqual((await owner.api.post('/invitations', { projectId: project._id, userId: ana.id })).status, 402);
  });

  await t.test('opt-in : seules les personnes disponibles apparaissent, jamais soi-même ni une personne bloquée', async () => {
    await setPlus(owner);
    await Promise.all([ben, cleo].map((u) => u.api.put('/user/profile', { openToProjects: true })));
    await owner.api.put('/user/profile', { openToProjects: true });
    await cleo.api.post(`/messages/block/${owner.id}`);
    const res = await owner.api.get('/talents');
    assert.strictEqual(res.status, 200);
    const ids = res.body.items.map((u) => u._id);
    assert.ok(ids.includes(ana.id) && ids.includes(ben.id));
    assert.ok(!ids.includes(dan.id), 'profil non disponible listé');
    assert.ok(!ids.includes(owner.id), 'soi-même listé');
    assert.ok(!ids.includes(cleo.id), 'personne qui m\'a bloqué listée');
    const fields = Object.keys(res.body.items[0]);
    for (const secret of ['email', 'phone', 'passwordHash', 'blockedUsers']) assert.ok(!fields.includes(secret), `champ exposé : ${secret}`);
  });

  await t.test('filtres : compétence, ville, texte libre', async () => {
    const bySkill = await owner.api.get('/talents?skill=guitare');
    assert.deepStrictEqual(bySkill.body.items.map((u) => u._id), [ana.id]);
    const byCity = await owner.api.get('/talents?city=lausanne');
    assert.deepStrictEqual(byCity.body.items.map((u) => u._id), [ben.id]);
    const byText = await owner.api.get(`/talents?q=${encodeURIComponent('cha')}`);
    assert.ok(byText.body.items.some((u) => u._id === ana.id));
    assert.strictEqual((await owner.api.get(`/talents?q=${encodeURIComponent('(.*)+$')}`)).status, 200);
  });

  let invitationId;
  await t.test('invitation : règles et notification', async () => {
    assert.strictEqual((await owner.api.post('/invitations', { projectId: project._id, userId: dan.id })).status, 404, 'profil non disponible');
    assert.strictEqual((await owner.api.post('/invitations', { projectId: project._id, userId: cleo.id })).status, 403, 'personne qui m\'a bloqué');
    assert.strictEqual((await owner.api.post('/invitations', { projectId: project._id, userId: owner.id })).status, 400);
    const other = (await ben.api.post('/projects/create', projectPayload({ title: 'Projet de Ben' }))).body;
    assert.strictEqual((await owner.api.post('/invitations', { projectId: other._id, userId: ana.id })).status, 403, 'projet d\'autrui');
    assert.strictEqual((await owner.api.post('/invitations', { projectId: project._id, userId: ana.id, message: 'x'.repeat(400) })).status, 400);

    const res = await owner.api.post('/invitations', { projectId: project._id, userId: ana.id, message: 'On cherche une chanteuse !' });
    assert.strictEqual(res.status, 201);
    invitationId = res.body._id;
    assert.strictEqual((await owner.api.post('/invitations', { projectId: project._id, userId: ana.id })).status, 409, 'doublon');
    const notifs = await ana.api.get('/messages/notifications');
    assert.ok(notifs.body.some((n) => n.type === 'invitation' && n.link === '/invitations'));
    await sleep(300);
    assert.match(server.mails.last(ana.email).subject, /invite/i);
    const search = await owner.api.get('/talents?skill=guitare');
    assert.deepStrictEqual(search.body.items[0].invitedTo, [project._id]);
  });

  await t.test('invitations reçues, refus discret', async () => {
    const mine = await ana.api.get('/invitations/mine');
    assert.strictEqual(mine.body.length, 1);
    assert.strictEqual(mine.body[0].projectId.title, 'Groupe de musique');
    assert.ok(!('email' in mine.body[0].inviterId));
    const toBen = (await owner.api.post('/invitations', { projectId: project._id, userId: ben.id })).body;
    assert.strictEqual((await ana.api.put(`/invitations/${toBen._id}/decline`)).status, 404, 'refuser l\'invitation d\'un autre');
    assert.strictEqual((await ben.api.put(`/invitations/${toBen._id}/decline`)).status, 200);
    assert.strictEqual((await ben.api.put(`/invitations/${toBen._id}/accept`)).status, 404, 'accepter après refus');
  });

  await t.test('acceptation : membre du projet et du groupe, créateur prévenu', async () => {
    const res = await ana.api.put(`/invitations/${invitationId}/accept`);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual((await ana.api.put(`/invitations/${invitationId}/accept`)).status, 404, 'double acceptation');
    const p = (await owner.api.get(`/projects/${project._id}`)).body;
    assert.deepStrictEqual(p.participants.map((x) => x._id), [ana.id]);
    const group = await ana.api.get(`/messages/group/${res.body.conversationId}`);
    assert.strictEqual(group.status, 200);
    assert.ok(group.body.some((m) => m.isSystem));
    assert.ok((await owner.api.get('/messages/notifications')).body.some((n) => n.type === 'invitation_accepted'));
    assert.strictEqual((await ana.api.get(`/requests/${project._id}/mine`)).body.status, 'accepted');
    assert.strictEqual((await owner.api.post('/invitations', { projectId: project._id, userId: ana.id })).status, 409, 'déjà membre');
  });

  await t.test('limite quotidienne d\'invitations', async () => {
    // 3 invitations par jour dans ce test (DAILY_INVITES=3) ; 2 déjà envoyées
    const big = (await owner.api.post('/projects/create', projectPayload({ title: 'Grand projet', maxParticipants: 50 }))).body;
    assert.strictEqual((await owner.api.post('/invitations', { projectId: big._id, userId: ben.id })).status, 201);
    const over = await owner.api.post('/invitations', { projectId: big._id, userId: ana.id });
    assert.strictEqual(over.status, 429, `limite non appliquée : ${over.status}`);
  });

  await t.test('projet complet : acceptation refusée proprement', async () => {
    await server.db.collection('projectinvitations').deleteMany({});
    const small = (await owner.api.post('/projects/create', projectPayload({ title: 'Duo', maxParticipants: 1 }))).body;
    const i1 = (await owner.api.post('/invitations', { projectId: small._id, userId: ben.id })).body;
    const i2 = (await owner.api.post('/invitations', { projectId: small._id, userId: ana.id })).body;
    assert.strictEqual((await ben.api.put(`/invitations/${i1._id}/accept`)).status, 200);
    const full = await ana.api.put(`/invitations/${i2._id}/accept`);
    assert.strictEqual(full.status, 409);
    const p = (await owner.api.get(`/projects/${small._id}`)).body;
    assert.strictEqual(p.participants.length, 1);
  });

  await t.test('se retirer de la recherche', async () => {
    await ben.api.put('/user/profile', { openToProjects: false });
    const res = await owner.api.get('/talents');
    assert.ok(!res.body.items.some((u) => u._id === ben.id));
    const pub = await owner.api.get(`/user/${ana.id}`);
    assert.strictEqual(pub.body.openToProjects, true);
  });
});
