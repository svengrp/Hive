/* Messages privés (Socket.io + REST) : envoi, historique, non-lus, saisie, blocage, archivage,
   emails « nouveau message » (hors ligne, anti-spam, préférences, charte, échappement HTML). */
const test = require('node:test');
const assert = require('node:assert');
const { skip, startServer, signUp, connectSocket, waitFor, expectNone, sleep } = require('./helpers');

test('messagerie privée et blocage', { skip }, async (t) => {
  const server = await startServer('dm');
  const sockets = [];
  t.after(async () => { sockets.forEach((s) => s.disconnect()); await server.stop(); });
  const [ana, ben, cleo] = await Promise.all(['ana', 'ben', 'cleo'].map((n) => signUp(server, n)));

  await t.test('email « nouveau message » quand le destinataire est hors ligne', async () => {
    const anaSock = await connectSocket(server, ana.token);
    sockets.push(anaSock);
    const sent = waitFor(anaSock, 'new_message', (m) => m.content.includes('<b>Salut</b>'));
    anaSock.emit('send_message', { to: ben.id, content: '<b>Salut</b> <script>alert(1)</script> Ben' });
    await sent;
    await sleep(300);
    const mail = server.mails.last(ben.email);
    assert.ok(mail, 'aucun email envoyé à Ben hors ligne');
    assert.match(mail.subject, /Ana/);
    assert.ok(!mail.html.includes('<script>'), 'HTML du message non échappé dans l\'email');
    assert.ok(mail.html.includes(`/messages?with=${ana.id}`), 'lien vers la conversation');
    assert.ok(!/#(a0560d|b8650f|faf6f0|2b2016|4a3b2c)/i.test(mail.html), 'bouton/couleurs orange de l\'ancienne palette');
    assert.match(mail.html, /#2459d6/i, 'bouton bleu Hive absent');

    // Anti-spam : pas de deuxième email dans les 15 minutes pour la même conversation
    const before = server.mails.to(ben.email).length;
    anaSock.emit('send_message', { to: ben.id, content: 'Tu es là ?' });
    await sleep(400);
    assert.strictEqual(server.mails.to(ben.email).length, before, 'email en double');
  });

  let anaSock; let benSock; let cleoSock;
  await t.test('DM en temps réel, historique, non-lus, lecture', async () => {
    anaSock = sockets[0];
    [benSock, cleoSock] = await Promise.all([connectSocket(server, ben.token), connectSocket(server, cleo.token)]);
    sockets.push(benSock, cleoSock);
    const received = waitFor(benSock, 'new_message', (m) => m.content === 'On se voit samedi ?');
    const echo = waitFor(anaSock, 'new_message', (m) => m.content === 'On se voit samedi ?');
    const notCleo = expectNone(cleoSock, 'new_message');
    anaSock.emit('send_message', { to: ben.id, content: '  On se voit samedi ?  ' });
    const msg = await received;
    await echo;
    await notCleo;
    assert.strictEqual(msg.senderId._id, ana.id);

    const before = server.mails.to(ben.email).length;
    await sleep(300);
    assert.strictEqual(server.mails.to(ben.email).length, before, 'email envoyé alors que Ben est en ligne');

    const history = await ben.api.get(`/messages/${ana.id}`);
    assert.strictEqual(history.status, 200);
    assert.strictEqual(history.body.at(-1).content, 'On se voit samedi ?');
    assert.ok((await ben.api.get('/messages/unread')).body.count >= 1);
    const convs = await ben.api.get('/messages/conversations');
    assert.ok(convs.body.some((c) => c.partner._id === ana.id && c.unread >= 1));
    await ben.api.put(`/messages/${ana.id}/read`);
    assert.strictEqual((await ben.api.get('/messages/unread')).body.count, 0);
    assert.strictEqual((await cleo.api.get(`/messages/${ana.id}`)).body.some((m) => m.receiverId?._id === ben.id), false, 'Cléo lit le DM Ana↔Ben');
  });

  await t.test('envois invalides ignorés ou refusés', async () => {
    const none = expectNone(anaSock, 'new_message', () => true, 500);
    anaSock.emit('send_message', { to: ana.id, content: 'moi-même' });
    anaSock.emit('send_message', { to: ben.id, content: '   ' });
    await none;
    const rude = waitFor(anaSock, 'message_error');
    anaSock.emit('send_message', { to: ben.id, content: 'sale connard' });
    await rude;
    const tooLong = waitFor(anaSock, 'message_error');
    anaSock.emit('send_message', { to: ben.id, content: 'x'.repeat(2500) });
    await tooLong;
    const badId = waitFor(anaSock, 'message_error', () => true, 1500).catch(() => null);
    anaSock.emit('send_message', { to: 'pas-un-id', content: 'hello' });
    await badId;
    const ghost = expectNone(anaSock, 'new_message', () => true, 500);
    anaSock.emit('send_message', { to: '000000000000000000000000', content: 'personne' });
    await ghost;
  });

  await t.test('indicateur de saisie', async () => {
    const typing = waitFor(benSock, 'typing', (p) => p.from === ana.id);
    anaSock.emit('typing', { to: ben.id });
    await typing;
  });

  await t.test('édition / suppression d\'un DM', async () => {
    const m = (await ana.api.get(`/messages/${ben.id}`)).body.at(-1);
    assert.strictEqual((await ben.api.put(`/messages/${m._id}/edit`, { content: 'hack' })).status, 403);
    const edited = waitFor(benSock, 'message_edited', (p) => p.msgId === m._id);
    assert.strictEqual((await ana.api.put(`/messages/${m._id}/edit`, { content: 'On se voit dimanche ?' })).status, 200);
    await edited;
    assert.strictEqual((await cleo.api.post(`/messages/${m._id}/react`, { emoji: '👍' })).status, 403, 'réaction d\'un tiers');
    assert.strictEqual((await ben.api.post(`/messages/${m._id}/react`, { emoji: '❤️' })).status, 200);
    assert.strictEqual((await ana.api.put(`/messages/${m._id}/pin`, { pinned: true })).status, 400, 'épingle réservée aux groupes');
  });

  await t.test('blocage : plus aucun message dans les deux sens', async () => {
    assert.strictEqual((await ben.api.post(`/messages/block/${ben.id}`)).status, 400, 'se bloquer soi-même');
    assert.strictEqual((await ben.api.post('/messages/block/pas-un-id')).status, 400, 'identifiant invalide');
    assert.strictEqual((await ben.api.post(`/messages/block/${ana.id}`)).status, 200);
    const blocked = await ben.api.get('/messages/blocked');
    assert.deepStrictEqual(blocked.body.map((u) => u._id), [ana.id]);
    assert.ok(!('email' in blocked.body[0]));

    const count = async () => (await server.db.collection('messages').countDocuments({ conversationId: null }));
    const n0 = await count();
    const silentBen = expectNone(benSock, 'new_message', () => true, 600);
    anaSock.emit('send_message', { to: ben.id, content: 'Pourquoi tu ne réponds pas ?' });
    await silentBen;
    benSock.emit('send_message', { to: ana.id, content: 'je te bloque mais je parle' });
    await sleep(300);
    assert.strictEqual(await count(), n0, 'message enregistré malgré le blocage');

    const convs = await ben.api.get('/messages/conversations');
    assert.ok(!convs.body.some((c) => c.partner._id === ana.id), 'conversation avec la personne bloquée toujours listée');

    // L'expéditeur bloqué est informé (sinon il croit que son message est parti)
    const info = waitFor(anaSock, 'message_error', () => true, 1500).catch(() => null);
    anaSock.emit('send_message', { to: ben.id, content: 'allô ?' });
    assert.ok(await info, 'aucun retour à l\'expéditeur bloqué : son message disparaît en silence');

    assert.strictEqual((await ben.api.del(`/messages/block/${ana.id}`)).status, 200);
    const back = waitFor(benSock, 'new_message', (m) => m.content === 'Réconciliés');
    anaSock.emit('send_message', { to: ben.id, content: 'Réconciliés' });
    await back;
  });

  await t.test('non-lus : les messages d\'une personne bloquée ne comptent pas', async () => {
    await ben.api.put(`/messages/${ana.id}/read`);
    anaSock.emit('send_message', { to: ben.id, content: 'non lu 1' });
    await sleep(300);
    await ben.api.post(`/messages/block/${ana.id}`);
    const unread = await ben.api.get('/messages/unread');
    assert.strictEqual(unread.body.count, 0, `badge à ${unread.body.count} pour une conversation invisible`);
    await ben.api.del(`/messages/block/${ana.id}`);
  });

  await t.test('archivage d\'une conversation privée', async () => {
    await ben.api.put(`/messages/dm/${ana.id}/archive`);
    assert.ok(!(await ben.api.get('/messages/conversations')).body.some((c) => c.partner._id === ana.id));
    assert.ok((await ben.api.get('/messages/dm/archived')).body.some((c) => c.partner._id === ana.id));
    await ben.api.put(`/messages/dm/${ana.id}/unarchive`);
    assert.ok((await ben.api.get('/messages/conversations')).body.some((c) => c.partner._id === ana.id));
  });

  await t.test('préférence « pas d\'email » respectée', async () => {
    assert.strictEqual((await cleo.api.put('/user/notification-prefs', { emailMessages: 'oui' })).status, 400);
    assert.strictEqual((await cleo.api.put('/user/notification-prefs', { emailMessages: false })).status, 200);
    cleoSock.disconnect();
    await sleep(200);
    const before = server.mails.to(cleo.email).length;
    anaSock.emit('send_message', { to: cleo.id, content: 'Coucou Cléo' });
    await sleep(400);
    assert.strictEqual(server.mails.to(cleo.email).length, before);
  });

  await t.test('socket sans jeton ou jeton faux refusé', async () => {
    await assert.rejects(connectSocket(server, 'faux'));
    await assert.rejects(connectSocket(server, undefined));
  });
});
