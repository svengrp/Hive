/* Test de charge local : serveur Hive réel (tests/e2e/helpers), base peuplée, puis
   autocannon sur les routes les plus sollicitées et 200 connexions Socket.io qui s'écrivent.
   Usage : MONGO_TEST_URI=mongodb://127.0.0.1:27018 npm run test:load
   Les chiffres d'une machine de développement sont bien meilleurs que ceux d'une instance
   Render Starter (0,5 vCPU) : ils servent à comparer avant/après et à repérer les routes lourdes. */
const autocannon = require('autocannon');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { Types } = require('mongoose');
const { startServer, connectSocket, JWT_SECRET, PASSWORD } = require('../e2e/helpers');

const USERS = 300;
const PROJECTS = 600;
const DM_PER_HEAVY_USER = 2000;
const DURATION = Number(process.env.LOAD_DURATION || 15);
const CONNECTIONS = Number(process.env.LOAD_CONNECTIONS || 50);

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
// Photo envoyée (≈150 Ko, le maximum accepté est 200 Ko), stockée comme le fait l'API : collection à part
const fakeAvatar = () => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(150 * 1024, 7)]);

async function seed(db) {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const users = Array.from({ length: USERS }, (_, i) => ({
    _id: new Types.ObjectId(),
    email: `load${i}@test.hive`,
    passwordHash,
    emailVerified: true,
    role: 'user',
    displayName: `Personne ${i}`,
    // Une personne sur cinq a une photo envoyée
    avatarUrl: i % 5 === 0 ? '' : '/avatars/default.png',
    avatarVersion: i % 5 === 0 ? Date.now() : null,
    blockedUsers: [],
    archivedDMs: [],
    reputation: { score: 0, votes: 0 },
    sessionVersion: 0,
    createdAt: new Date(),
  }));
  await db.collection('users').insertMany(users);
  await db.collection('useravatars').insertMany(users.filter((u) => u.avatarVersion)
    .map((u) => ({ userId: u._id, data: fakeAvatar(), contentType: 'image/jpeg' })));

  const projects = Array.from({ length: PROJECTS }, (_, i) => ({
    _id: new Types.ObjectId(),
    ownerId: pick(users)._id,
    title: `Projet ${i} — atelier de quartier`,
    description: 'Description '.repeat(80),
    tags: ['sport', 'musique', 'tech', 'social', 'nature'].slice(0, 1 + (i % 5)),
    requiredSkills: [],
    langues: ['fr'],
    participants: users.slice(i % 50, (i % 50) + 4).map((u) => u._id),
    status: 'open',
    visibility: 'public',
    maxParticipants: 10,
    location: { type: 'Point', coordinates: [6 + Math.random(), 46 + Math.random()] },
    projectMeta: { city: 'Genève', region: 'Suisse', startDate: new Date(), budget: 0 },
    cached: { avgRating: 0, ratingCount: 0 },
    createdAt: new Date(Date.now() - i * 60000),
    updatedAt: new Date(),
  }));
  await db.collection('projects').insertMany(projects);

  // Une personne très active : 2000 messages privés avec 40 interlocuteurs
  const heavy = users[1];
  const messages = Array.from({ length: DM_PER_HEAVY_USER }, (_, i) => {
    const other = users[2 + (i % 40)];
    const out = i % 2 === 0;
    return {
      senderId: out ? heavy._id : other._id,
      receiverId: out ? other._id : heavy._id,
      content: `Message ${i}`,
      read: i % 3 !== 0,
      conversationId: null,
      readBy: [],
      reactions: [],
      isSystem: false,
      deleted: false,
      edited: false,
      pinned: false,
      replyTo: null,
      createdAt: new Date(Date.now() - i * 1000),
      updatedAt: new Date(),
    };
  });
  await db.collection('messages').insertMany(messages);
  return { users, projects, heavy };
}

const token = (user) => jwt.sign({ id: user._id, email: user.email, role: 'user', v: 0 }, JWT_SECRET, { expiresIn: '1h' });

function run(title, opts) {
  return new Promise((resolve, reject) => {
    autocannon({ duration: DURATION, connections: CONNECTIONS, ...opts }, (err, r) => {
      if (err) return reject(err);
      resolve({
        scénario: title,
        'req/s': Math.round(r.requests.average),
        'p50 ms': r.latency.p50,
        'p99 ms': r.latency.p99,
        'Ko/rép.': r.requests.total ? Math.round(r.throughput.total / r.requests.total / 1024) : 0,
        erreurs: r.errors + r.timeouts + r.non2xx,
      });
    });
  });
}

async function socketScenario(server, users) {
  const N = 200;
  const people = users.slice(10, 10 + N);
  const sockets = await Promise.all(people.map((u) => connectSocket(server, token(u))));
  const latencies = [];
  let errors = 0;
  sockets.forEach((s, i) => {
    const me = String(people[i]._id);
    s.on('new_message', (m) => {
      const sentAt = Number(String(m.content).split(':')[1]);
      if (sentAt && String(m.receiverId?._id) === me) latencies.push(Date.now() - sentAt);
    });
    s.on('message_error', () => { errors += 1; });
  });

  const end = Date.now() + DURATION * 1000;
  let sent = 0;
  await Promise.all(sockets.map(async (s, i) => {
    while (Date.now() < end) {
      const to = people[(i + 1 + Math.floor(Math.random() * (N - 1))) % N];
      s.emit('send_message', { to: String(to._id), content: `ping:${Date.now()}` });
      sent += 1;
      await new Promise((r) => setTimeout(r, 1000 + Math.random() * 1000));
    }
  }));
  await new Promise((r) => setTimeout(r, 1500));
  sockets.forEach((s) => s.disconnect());
  latencies.sort((a, b) => a - b);
  const q = (p) => latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * p))] ?? null;
  return {
    scénario: `Socket.io : ${N} personnes connectées, ~1 message / 1,5 s chacune`,
    'req/s': Math.round(sent / DURATION),
    'p50 ms': q(0.5),
    'p99 ms': q(0.99),
    'Ko/rép.': '-',
    erreurs: errors + (sent - latencies.length),
  };
}

(async () => {
  const server = await startServer('load', { SOCKET_MSG_LIMIT: '1000' });
  try {
    console.log('Peuplement de la base…');
    const { users, projects, heavy } = await seed(server.db);
    await new Promise((r) => setTimeout(r, 1500)); // index (texte, géo) créés par Mongoose au démarrage
    const api = `${server.url}/api`;
    const auth = { authorization: `Bearer ${token(heavy)}` };
    const rows = [];
    rows.push(await run('Page Projets (12 par page)', { url: `${api}/projects?limit=12` }));
    rows.push(await run('Carte : tous les projets ouverts', { url: `${api}/projects` }));
    rows.push(await run('Détail d\'un projet', { url: `${api}/projects/${projects[42]._id}` }));
    rows.push(await run('Recherche « atelier »', { url: `${api}/projects?q=atelier&limit=12` }));
    rows.push(await run('Liste des conversations (2000 messages)', { url: `${api}/messages/conversations`, headers: auth }));
    rows.push(await run('Badge non-lus', { url: `${api}/messages/unread`, headers: auth }));
    rows.push(await run('Photo de profil (150 Ko)', { url: `${api}/user/${users[0]._id}/avatar?v=${users[0].avatarVersion}` }));
    // Connexion : une IP différente à chaque requête (sinon le limiteur de 5/min répond 429)
    let n = 0;
    rows.push(await run('Connexion (bcrypt)', {
      url: `${api}/auth/login`,
      connections: 20,
      requests: [{
        method: 'POST',
        setupRequest: (req) => {
          n += 1;
          return {
            ...req,
            headers: { 'content-type': 'application/json', 'cf-connecting-ip': `10.${n % 250}.${Math.floor(n / 250) % 250}.1` },
            body: JSON.stringify({ email: pick(users).email, password: PASSWORD }),
          };
        },
      }],
    }));
    rows.push(await socketScenario(server, users));
    console.table(rows);
  } finally {
    await server.stop();
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
