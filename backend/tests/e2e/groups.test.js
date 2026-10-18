/* Demandes de participation, groupe de projet (Socket.io), réactions, épingles, édition,
   espace projet (tâches, rendez-vous), départ, exclusion, clôture. */
const test = require('node:test');
const assert = require('node:assert');
const { skip, startServer, signUp, projectPayload, connectSocket, waitFor, expectNone } = require('./helpers');

test('demandes et messagerie de groupe', { skip }, async (t) => {
  const server = await startServer('groups');
  const sockets = [];
  t.after(async () => { sockets.forEach((s) => s.disconnect()); await server.stop(); });
  const [owner, ana, ben, eve] = await Promise.all(['owner', 'ana', 'ben', 'eve'].map((n) => signUp(server, n)));
  const project = (await owner.api.post('/projects/create', projectPayload({ maxParticipants: 2 }))).body;

  let anaReq;
  await t.test('demande : envoi, doublon, notification et email au créateur', async () => {
    assert.strictEqual((await owner.api.post(`/requests/${project._id}`, { message: 'moi' })).status, 403, 'le créateur ne peut pas postuler');
    const res = await ana.api.post(`/requests/${project._id}`, { message: 'Je sais réparer les freins' });
    assert.strictEqual(res.status, 201);
    anaReq = res.body;
    assert.strictEqual((await ana.api.post(`/requests/${project._id}`, { message: 'encore' })).status, 409);
    const notifs = await owner.api.get('/messages/notifications');
    assert.ok(notifs.body.some((n) => n.type === 'new_member'));
    const mail = server.mails.last(owner.email);
    assert.ok(mail && /demande/i.test(mail.subject), 'email au créateur');
    assert.strictEqual((await ana.api.get(`/requests/${project._id}/mine`)).body.status, 'pending');
  });

  await t.test('liste des demandes : créateur uniquement', async () => {
    assert.strictEqual((await ana.api.get(`/requests/${project._id}/list`)).status, 403);
    const list = await owner.api.get(`/requests/${project._id}/list`);
    assert.strictEqual(list.status, 200);
    assert.strictEqual(list.body.length, 1);
    assert.ok(!('email' in list.body[0].senderId), 'email du candidat exposé');
  });

  let convId;
  await t.test('acceptation : membre ajouté, groupe créé, message système, email', async () => {
    assert.strictEqual((await ana.api.put(`/requests/${anaReq._id}/accept`)).status, 403, 'le candidat ne peut pas s\'accepter');
    const res = await owner.api.put(`/requests/${anaReq._id}/accept`);
    assert.strictEqual(res.status, 200);
    convId = String(res.body.conversationId);
    const p = (await owner.api.get(`/projects/${project._id}`)).body;
    assert.deepStrictEqual(p.participants.map((x) => x._id), [ana.id]);
    const msgs = await ana.api.get(`/messages/group/${convId}`);
    assert.strictEqual(msgs.status, 200);
    assert.ok(msgs.body[0].isSystem);
    assert.ok(/acceptée/i.test(server.mails.last(ana.email).subject));
    const again = await owner.api.put(`/requests/${anaReq._id}/accept`);
    assert.strictEqual(again.status, 409, `double acceptation : ${again.status}`);
    const member = await ana.api.post(`/requests/${project._id}`, { message: 'encore moi' });
    assert.strictEqual(member.status, 409, `un membre peut re-postuler : ${member.status}`);
  });

  await t.test('limite de participants respectée', async () => {
    const benReq = (await ben.api.post(`/requests/${project._id}`, { message: 'moi aussi' })).body;
    const eveReq = (await eve.api.post(`/requests/${project._id}`, { message: 'et moi' })).body;
    assert.strictEqual((await owner.api.put(`/requests/${benReq._id}/accept`)).status, 200);
    const full = await owner.api.put(`/requests/${eveReq._id}/accept`);
    assert.strictEqual(full.status, 409, `3e membre accepté avec maxParticipants=2 : ${full.status}`);
    const p = (await owner.api.get(`/projects/${project._id}`)).body;
    assert.ok(p.participants.length <= 2, `${p.participants.length} participants pour 2 places`);
    assert.strictEqual((await owner.api.put(`/requests/${eveReq._id}/decline`)).status, 200);
  });

  let ownerSock; let anaSock; let benSock; let eveSock;
  await t.test('message de groupe en temps réel ; étrangers exclus', async () => {
    [ownerSock, anaSock, benSock, eveSock] = await Promise.all([owner, ana, ben, eve].map((u) => connectSocket(server, u.token)));
    sockets.push(ownerSock, anaSock, benSock, eveSock);
    const got = waitFor(ownerSock, 'new_group_message', (p) => p.message.content === 'Salut l\'équipe');
    const gotBen = waitFor(benSock, 'new_group_message', (p) => p.message.content === 'Salut l\'équipe');
    const notEve = expectNone(eveSock, 'new_group_message');
    anaSock.emit('send_group_message', { conversationId: convId, content: 'Salut l\'équipe' });
    const payload = await got;
    await gotBen;
    await notEve;
    assert.strictEqual(payload.message.senderId._id, ana.id);

    // Eve n'est pas membre : ni lecture, ni écriture, ni indicateur de saisie
    assert.strictEqual((await eve.api.get(`/messages/group/${convId}`)).status, 403);
    const noMsg = expectNone(ownerSock, 'new_group_message', (p) => p.message.content === 'intrusion');
    eveSock.emit('send_group_message', { conversationId: convId, content: 'intrusion' });
    await noMsg;
    eveSock.emit('join_conversation', convId);
    const spy = expectNone(eveSock, 'typing_group');
    anaSock.emit('typing_group', { conversationId: convId });
    await spy;
  });

  let msgId;
  await t.test('réponse citée, réactions, épingles', async () => {
    const first = (await ana.api.get(`/messages/group/${convId}`)).body.find((m) => m.content === 'Salut l\'équipe');
    const reply = waitFor(anaSock, 'new_group_message', (p) => p.message.content === 'Bienvenue !');
    ownerSock.emit('send_group_message', { conversationId: convId, content: 'Bienvenue !', replyTo: first._id });
    const r = await reply;
    assert.strictEqual(r.message.replyTo._id, first._id);
    msgId = r.message._id;

    assert.strictEqual((await ana.api.post(`/messages/${msgId}/react`, { emoji: '💩' })).status, 400, 'emoji non autorisé');
    assert.strictEqual((await eve.api.post(`/messages/${msgId}/react`, { emoji: '👍' })).status, 403, 'étranger');
    const react = await ana.api.post(`/messages/${msgId}/react`, { emoji: '👍' });
    assert.strictEqual(react.body.reactions.length, 1);
    const unreact = await ana.api.post(`/messages/${msgId}/react`, { emoji: '👍' });
    assert.strictEqual(unreact.body.reactions.length, 0, 'deuxième clic = retrait');

    assert.strictEqual((await eve.api.put(`/messages/${msgId}/pin`, { pinned: true })).status, 403);
    assert.strictEqual((await ben.api.put(`/messages/${msgId}/pin`, { pinned: true })).status, 200);
    const pinned = await ana.api.get(`/messages/group/${convId}/pinned`);
    assert.deepStrictEqual(pinned.body.map((m) => m._id), [msgId]);
  });

  await t.test('édition et suppression : auteur seulement, messages système protégés', async () => {
    assert.strictEqual((await ana.api.put(`/messages/${msgId}/edit`, { content: 'modifié par Ana' })).status, 403);
    const edited = waitFor(anaSock, 'message_edited', (p) => p.msgId === msgId);
    assert.strictEqual((await owner.api.put(`/messages/${msgId}/edit`, { content: 'Bienvenue à vous deux !' })).status, 200);
    assert.strictEqual((await edited).content, 'Bienvenue à vous deux !');
    const rude = await owner.api.put(`/messages/${msgId}/edit`, { content: 'espèce de connard' });
    assert.strictEqual(rude.status, 400, `grossièreté acceptée en édition : ${rude.status}`);
    const huge = await owner.api.put(`/messages/${msgId}/edit`, { content: 'x'.repeat(3000) });
    assert.strictEqual(huge.status, 400, `3000 caractères en édition : ${huge.status}`);

    const system = (await ana.api.get(`/messages/group/${convId}`)).body.find((m) => m.isSystem && m.senderId?._id === ana.id);
    assert.ok(system, 'message système « a rejoint » attribué à Ana');
    const tamper = await ana.api.put(`/messages/${system._id}/edit`, { content: 'Ana est la cheffe' });
    assert.strictEqual(tamper.status, 403, `message système modifiable : ${tamper.status}`);
    assert.strictEqual((await ana.api.del(`/messages/${system._id}/delete`)).status, 403, 'message système supprimable');

    assert.strictEqual((await ana.api.del(`/messages/${msgId}/delete`)).status, 403);
    const deleted = waitFor(benSock, 'message_deleted', (p) => p.msgId === msgId);
    assert.strictEqual((await owner.api.del(`/messages/${msgId}/delete`)).status, 200);
    await deleted;
  });

  await t.test('espace projet : tâches et rendez-vous', async () => {
    assert.strictEqual((await eve.api.get(`/workspace/${convId}`)).status, 403);
    assert.strictEqual((await ana.api.post(`/workspace/${convId}/tasks`, { title: 'Acheter des chambres à air', assigneeId: eve.id })).status, 400, 'assigner un non-membre');
    const task = await ana.api.post(`/workspace/${convId}/tasks`, { title: 'Acheter des chambres à air', assigneeId: ben.id, dueDate: '2030-05-01' });
    assert.strictEqual(task.status, 201);
    assert.strictEqual((await ben.api.patch(`/workspace/${convId}/tasks/${task.body._id}`, { done: true })).body.done, true);
    assert.strictEqual((await ben.api.del(`/workspace/${convId}/tasks/${task.body._id}`)).status, 403, 'ni auteur ni créateur');
    assert.strictEqual((await owner.api.del(`/workspace/${convId}/tasks/${task.body._id}`)).status, 200, 'le créateur du projet peut supprimer');

    const sys = waitFor(benSock, 'new_group_message', (p) => /rendez-vous/i.test(p.message.content));
    const ev = await ana.api.post(`/workspace/${convId}/events`, { title: 'Atelier samedi', startsAt: '2030-05-04T09:00:00Z', location: 'Garage' });
    assert.strictEqual(ev.status, 201);
    await sys;
    assert.strictEqual((await ben.api.put(`/workspace/${convId}/events/${ev.body._id}/rsvp`, { status: 'peut-être' })).status, 400);
    const rsvp = await ben.api.put(`/workspace/${convId}/events/${ev.body._id}/rsvp`, { status: 'maybe' });
    assert.ok(rsvp.body.rsvps.some((r) => r.userId._id === ben.id && r.status === 'maybe'));
    assert.strictEqual((await ben.api.patch(`/workspace/${convId}/events/${ev.body._id}`, { title: 'Annulé' })).status, 403);
  });

  await t.test('archiver, désarchiver, supprimer une conversation (pour soi)', async () => {
    assert.strictEqual((await ben.api.del(`/messages/group/${convId}`)).status, 404, 'suppression sans archivage');
    await ben.api.put(`/messages/group/${convId}/archive`);
    assert.ok(!(await ben.api.get('/messages/group/mine')).body.some((g) => g.conversation._id === convId));
    assert.ok((await ben.api.get('/messages/group/archived')).body.some((g) => g.conversation._id === convId));
    await ben.api.put(`/messages/group/${convId}/unarchive`);
    assert.ok((await ben.api.get('/messages/group/mine')).body.some((g) => g.conversation._id === convId));
    assert.ok((await ana.api.get('/messages/group/mine')).body.some((g) => g.conversation._id === convId), 'n\'affecte pas les autres');
  });

  await t.test('départ volontaire : plus d\'accès au groupe', async () => {
    assert.strictEqual((await owner.api.post(`/projects/${project._id}/leave`)).status, 403, 'le créateur ne peut pas partir');
    const notice = waitFor(ownerSock, 'new_group_message', (p) => /a quitté/.test(p.message.content));
    assert.strictEqual((await ben.api.post(`/projects/${project._id}/leave`, { message: 'Plus le temps' })).status, 200);
    await notice;
    assert.strictEqual((await ben.api.get(`/messages/group/${convId}`)).status, 403);
    const silent = expectNone(ownerSock, 'new_group_message', (p) => p.message.content === 'je suis parti mais je parle');
    benSock.emit('send_group_message', { conversationId: convId, content: 'je suis parti mais je parle' });
    await silent;
  });

  await t.test('exclusion avec note : notification, pas de nouvelle candidature', async () => {
    const kicked = waitFor(anaSock, 'kicked_from_project');
    assert.strictEqual((await ben.api.del(`/projects/${project._id}/participants/${ana.id}`, { reason: 'x' })).status, 403);
    assert.strictEqual((await owner.api.del(`/projects/${project._id}/participants/${ana.id}`, { reason: 'Absente', rating: 2 })).status, 200);
    await kicked;
    assert.ok((await ana.api.get('/messages/notifications')).body.some((n) => n.type === 'kicked'));
    assert.strictEqual((await ana.api.post(`/requests/${project._id}`, { message: 'pardon' })).status, 403);
    assert.strictEqual((await ana.api.get(`/requests/${project._id}/mine`)).body.status, 'kicked');
  });

  await t.test('projet clôturé : discussion fermée', async () => {
    const p2 = (await owner.api.post('/projects/create', projectPayload({ title: 'Projet court' }))).body;
    const r = (await eve.api.post(`/requests/${p2._id}`, {})).body;
    const conv2 = String((await owner.api.put(`/requests/${r._id}/accept`)).body.conversationId);
    assert.strictEqual((await eve.api.post(`/projects/${p2._id}/close`)).status, 403);
    assert.strictEqual((await owner.api.post(`/projects/${p2._id}/close`)).status, 200);
    assert.strictEqual((await owner.api.post(`/projects/${p2._id}/close`)).status, 400);
    const err = waitFor(eveSock, 'message_error');
    eveSock.emit('send_group_message', { conversationId: conv2, content: 'encore là ?' });
    assert.match((await err).message, /clôturé/);
    assert.strictEqual((await ben.api.post(`/requests/${p2._id}`, {})).status, 400, 'candidature sur projet clôturé');
  });
});
