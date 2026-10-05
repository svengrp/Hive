/* Supprime les données du seed de démo (comptes @hive-demo.com) et tout ce qui en dépend.
   Par défaut : simulation, rien n'est supprimé (affiche ce qui le serait).
     node scripts/purgeDemoData.js            → simulation
     node scripts/purgeDemoData.js --apply    → sauvegarde JSON puis suppression
   Les comptes réels sont conservés ; les références vers des comptes de démo y sont retirées. */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const fs = require('fs');
const path = require('path');
const { EJSON } = require('bson');
const { connectDB, closeDB } = require('../db');
const User = require('../models/User');
const Project = require('../models/Project');
const ProjectCover = require('../models/ProjectCover');
const ProjectHistory = require('../models/ProjectHistory');
const ProjectRequest = require('../models/ProjectRequest');
const ProjectEvent = require('../models/ProjectEvent');
const ProjectTask = require('../models/ProjectTask');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const Notification = require('../models/Notification');
const Rating = require('../models/Rating');

const APPLY = process.argv.includes('--apply');
const DEMO_EMAIL = /@hive-demo\.com$/i;

const mask = (email) => email.replace(/^(.{2}).*(@.*)$/, '$1***$2');

async function main() {
  await connectDB(process.env.MONGO_URI);

  const demoUsers = await User.find({ email: DEMO_EMAIL }).select('_id').lean();
  const userIds = demoUsers.map((u) => u._id);
  const realUsers = await User.find({ email: { $not: DEMO_EMAIL } }).select('email role').lean();

  const projectIds = (await Project.find({ ownerId: { $in: userIds } }).select('_id').lean()).map((p) => p._id);
  const conversationIds = (await Conversation.find({
    $or: [{ projectId: { $in: projectIds } }, { participants: { $in: userIds } }],
  }).select('_id').lean()).map((c) => c._id);

  // Ce qui sera supprimé, collection par collection (dépendances d'abord).
  const plan = [
    ['messages', Message, { $or: [{ conversationId: { $in: conversationIds } }, { senderId: { $in: userIds } }, { receiverId: { $in: userIds } }] }],
    ['projectEvents', ProjectEvent, { $or: [{ conversationId: { $in: conversationIds } }, { createdBy: { $in: userIds } }] }],
    ['projectTasks', ProjectTask, { $or: [{ conversationId: { $in: conversationIds } }, { createdBy: { $in: userIds } }] }],
    ['conversations', Conversation, { _id: { $in: conversationIds } }],
    ['projectRequests', ProjectRequest, { $or: [{ projectId: { $in: projectIds } }, { senderId: { $in: userIds } }, { projectOwnerId: { $in: userIds } }] }],
    ['projectHistory', ProjectHistory, { $or: [{ projectId: { $in: projectIds } }, { userId: { $in: userIds } }] }],
    ['projectCovers', ProjectCover, { projectId: { $in: projectIds } }],
    ['ratings', Rating, { $or: [{ raterId: { $in: userIds } }, { targetId: { $in: userIds } }, { projectId: { $in: projectIds } }] }],
    ['notifications', Notification, { userId: { $in: userIds } }],
    ['projects', Project, { _id: { $in: projectIds } }],
    ['users', User, { _id: { $in: userIds } }],
  ];

  console.log(APPLY ? '=== SUPPRESSION ===' : '=== SIMULATION (rien n\'est supprimé) ===');
  for (const [name, Model, filter] of plan) {
    console.log(`${name.padEnd(16)} ${await Model.countDocuments(filter)}`);
  }
  console.log(`\nComptes réels conservés (${realUsers.length}) :`);
  realUsers.forEach((u) => console.log(`  - ${mask(u.email)}${u.role === 'admin' ? ' (admin)' : ''}`));

  if (!APPLY) {
    console.log('\nPour supprimer : node scripts/purgeDemoData.js --apply');
    return;
  }

  // Sauvegarde de tout ce qui va être supprimé, avant la moindre écriture.
  const backup = {};
  for (const [name, Model, filter] of plan) backup[name] = await Model.find(filter).lean();
  const dir = path.join(__dirname, 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `demo-purge-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(file, EJSON.stringify(backup, { relaxed: false }));
  console.log(`\nSauvegarde : ${file}`);

  for (const [name, Model, filter] of plan) {
    const { deletedCount } = await Model.deleteMany(filter);
    console.log(`supprimé ${name.padEnd(16)} ${deletedCount}`);
  }

  // Retire les références vers les comptes de démo dans ce qui reste.
  await User.updateMany({}, { $pull: { blockedUsers: { $in: userIds }, archivedDMs: { $in: userIds } } });
  await Project.updateMany({}, { $pull: { participants: { $in: userIds } } });
  console.log('Références nettoyées.');
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => closeDB());
