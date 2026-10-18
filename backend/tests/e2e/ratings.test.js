/* Notation des participants après clôture : droits, doublons (y compris envois simultanés),
   moyenne de réputation, notification, historique. */
const test = require('node:test');
const assert = require('node:assert');
const { skip, startServer, signUp, projectPayload } = require('./helpers');

test('notation des participants', { skip }, async (t) => {
  const server = await startServer('ratings');
  t.after(() => server.stop());
  const [owner, ana, ben, outsider] = await Promise.all(['owner', 'ana', 'ben', 'outsider'].map((n) => signUp(server, n)));
  const project = (await owner.api.post('/projects/create', projectPayload())).body;
  for (const u of [ana, ben]) {
    const r = (await u.api.post(`/requests/${project._id}`, {})).body;
    await owner.api.put(`/requests/${r._id}/accept`);
  }
  const rate = (u, targetId, score, comment) => u.api.post(`/projects/${project._id}/rate`, { targetId, score, comment });

  await t.test('impossible avant la clôture', async () => {
    assert.strictEqual((await rate(ana, owner.id, 5)).status, 400);
  });

  await t.test('après clôture : règles de notation', async () => {
    assert.strictEqual((await owner.api.post(`/projects/${project._id}/close`)).status, 200);
    assert.strictEqual((await rate(ana, ana.id, 5)).status, 400, 'se noter soi-même');
    for (const bad of [0, 6, -1, 'abc', null, 4.5]) {
      const res = await rate(ana, owner.id, bad);
      assert.strictEqual(res.status, 400, `note ${bad} → ${res.status}`);
    }
    assert.strictEqual((await rate(outsider, owner.id, 1)).status, 403, 'personne extérieure');
    assert.strictEqual((await rate(ana, outsider.id, 1)).status, 404, 'cible extérieure');
    const badId = await rate(ana, 'pas-un-id', 3);
    assert.ok([400, 404].includes(badId.status), `identifiant invalide → ${badId.status}`);
    const long = await rate(ana, owner.id, 4, 'x'.repeat(5000));
    assert.strictEqual(long.status, 400, `commentaire de 5000 caractères → ${long.status}`);
  });

  await t.test('note, moyenne, notification, pas de doublon', async () => {
    assert.strictEqual((await rate(ana, owner.id, 5, 'Super organisation')).status, 201);
    assert.strictEqual((await rate(ben, owner.id, 4)).status, 201);
    assert.strictEqual((await rate(ana, owner.id, 1)).status, 400, 'deuxième note');
    const profile = await outsider.api.get(`/user/${owner.id}`);
    assert.deepStrictEqual(profile.body.reputation, { score: 4.5, votes: 2 });
    const notifs = await owner.api.get('/messages/notifications');
    assert.strictEqual(notifs.body.filter((n) => n.type === 'rated').length, 2);
    const mine = await owner.api.get('/user/ratings');
    assert.strictEqual(mine.body.length, 2);
    assert.ok(!('email' in mine.body[0].raterId));
  });

  await t.test('envois simultanés : une seule note comptée', async () => {
    const results = await Promise.all(Array.from({ length: 8 }, () => rate(owner, ben.id, 5)));
    const created = results.filter((r) => r.status === 201).length;
    assert.strictEqual(created, 1, `${created} notes créées en parallèle`);
    const profile = await outsider.api.get(`/user/${ben.id}`);
    assert.strictEqual(profile.body.reputation.votes, 1, `réputation gonflée : ${profile.body.reputation.votes} votes`);
  });
});
