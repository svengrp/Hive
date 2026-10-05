/* Suppression de compte (LPD art. 32 / RGPD art. 17) : test d'intégration sur une vraie base.
   Ignoré sans MONGO_TEST_URI. Exemple :
     docker run -d --rm --name hive-test-mongo -p 27018:27017 mongo:7
     MONGO_TEST_URI=mongodb://127.0.0.1:27018/hive_test npm test
   La base indiquée est vidée : ne jamais y mettre l'URI de production. */
const test = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');

const URI = process.env.MONGO_TEST_URI;

test('suppression de compte : efface ses données, préserve celles des autres', { skip: !URI && 'MONGO_TEST_URI absent' }, async (t) => {
  assert.ok(!/mongodb\.net|prod/i.test(URI), 'refus : URI qui ressemble à la production');
  await mongoose.connect(URI);
  t.after(() => mongoose.disconnect());
  await mongoose.connection.db.dropDatabase();

  const User = require('../models/User');
  const Project = require('../models/Project');
  const ProjectCover = require('../models/ProjectCover');
  const ProjectHistory = require('../models/ProjectHistory');
  const ProjectRequest = require('../models/ProjectRequest');
  const Conversation = require('../models/Conversation');
  const Message = require('../models/Message');
  const Notification = require('../models/Notification');
  const Rating = require('../models/Rating');
  const { deleteUserAccount } = require('../utils/accountDeletion');

  const point = { type: 'Point', coordinates: [6.14, 46.2] };
  const [lea, max] = await User.create([
    { email: 'lea@example.com', firstName: 'Léa', address: { street: 'Rue 1', city: 'Genève' } },
    { email: 'max@example.com', firstName: 'Max' },
  ]);

  // Projet de Léa (doit disparaître entièrement) et projet de Max (doit rester)
  const leaProject = await Project.create({ ownerId: lea._id, title: 'Projet de Léa', location: point, participants: [max._id] });
  const maxProject = await Project.create({ ownerId: max._id, title: 'Projet de Max', location: point, participants: [lea._id] });
  const leaConv = await Conversation.create({ type: 'project', projectId: leaProject._id, participants: [lea._id, max._id] });
  const maxConv = await Conversation.create({ type: 'project', projectId: maxProject._id, participants: [max._id, lea._id] });

  await ProjectCover.create({ projectId: leaProject._id, contentType: 'image/png', full: Buffer.from('x'), thumb: Buffer.from('x') });
  await Message.create([
    { senderId: lea._id, conversationId: leaConv._id, content: 'secret dans mon projet' },
    { senderId: lea._id, conversationId: maxConv._id, content: 'mon numéro : 079 000 00 00', readBy: [max._id] },
    { senderId: max._id, conversationId: maxConv._id, content: 'salut', readBy: [lea._id], reactions: [{ emoji: '👍', userId: lea._id }] },
  ]);
  await ProjectRequest.create({ projectId: maxProject._id, projectOwnerId: max._id, senderId: lea._id, message: 'je veux venir' });
  await ProjectHistory.create({ userId: lea._id, projectId: maxProject._id });
  await Notification.create({ userId: lea._id, type: 'new_member', message: 'Bienvenue' });
  await Rating.create([
    { targetType: 'user', targetId: max._id, raterId: lea._id, projectId: maxProject._id, score: 5 },
    { targetType: 'user', targetId: lea._id, raterId: max._id, projectId: maxProject._id, score: 4 },
  ]);

  await User.updateOne({ _id: max._id }, { $set: { blockedUsers: [lea._id], archivedDMs: [lea._id] } });

  await deleteUserAccount(lea);

  // Plus rien qui identifie Léa
  assert.strictEqual(await User.countDocuments({ _id: lea._id }), 0);
  assert.strictEqual(await Project.countDocuments({ _id: leaProject._id }), 0);
  assert.strictEqual(await Conversation.countDocuments({ _id: leaConv._id }), 0);
  assert.strictEqual(await ProjectCover.countDocuments({}), 0);
  assert.strictEqual(await ProjectRequest.countDocuments({}), 0);
  assert.strictEqual(await ProjectHistory.countDocuments({}), 0);
  assert.strictEqual(await Notification.countDocuments({}), 0);
  assert.strictEqual(await Rating.countDocuments({}), 0);
  assert.strictEqual(await Message.countDocuments({ content: /secret|079/ }), 0, 'aucun texte de Léa ne subsiste');

  // Le projet et la conversation de Max restent, sans Léa
  const max2 = await Project.findById(maxProject._id).lean();
  assert.ok(max2, 'le projet de Max existe toujours');
  assert.deepStrictEqual(max2.participants, []);
  const conv2 = await Conversation.findById(maxConv._id).lean();
  assert.deepStrictEqual(conv2.participants.map(String), [String(max._id)]);
  const maxMsg = await Message.findOne({ senderId: max._id }).lean();
  assert.strictEqual(maxMsg.content, 'salut');
  assert.deepStrictEqual(maxMsg.readBy, []);
  assert.deepStrictEqual(maxMsg.reactions, []);
  const leaMsg = await Message.findOne({ senderId: lea._id }).lean();
  assert.strictEqual(leaMsg.deleted, true);
  const maxUser = await User.findById(max._id).lean();
  assert.deepStrictEqual(maxUser.blockedUsers, []);
  assert.deepStrictEqual(maxUser.archivedDMs, []);
});
