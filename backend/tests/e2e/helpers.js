/* Harnais des tests de bout en bout de l'API : chaque fichier de test démarre son propre serveur Hive
   (vrai server.js, vraie base MongoDB, vrai Socket.io) sur un port libre et une base dédiée.
   Les emails sont capturés dans un fichier (captureMail.js) : aucun envoi réel.

   Prérequis : une base MongoDB locale jetable, par exemple
     mongod --dbpath /tmp/hive-test-db --port 27018
   Puis : MONGO_TEST_URI=mongodb://127.0.0.1:27018 npm run test:e2e
   Les bases hive_e2e_* sont vidées : ne jamais pointer MONGO_TEST_URI vers la production. */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const { io: ioClient } = require('socket.io-client');

const BASE_URI = process.env.MONGO_TEST_URI;
const BACKEND_DIR = path.join(__dirname, '..', '..');
const JWT_SECRET = 'e2e-secret-not-for-prod';
const WEBHOOK_SECRET = 'whsec_e2e_test_secret';
const PASSWORD = 'Hive.Test1';

const skip = !BASE_URI && 'MONGO_TEST_URI absent (base MongoDB locale requise)';

// Le serveur lit le .env du dépôt : seule une clé Stripe de TEST lui est laissée.
const ENV_FILE = path.join(BACKEND_DIR, '..', '.env');
const repoEnv = fs.existsSync(ENV_FILE) ? require('dotenv').parse(fs.readFileSync(ENV_FILE)) : {};
const STRIPE_TEST_KEY = /^sk_test_/.test(repoEnv.STRIPE_SECRET_KEY || '') ? repoEnv.STRIPE_SECRET_KEY : '';

/* Base locale uniquement (le nom de base éventuel est ignoré : chaque fichier crée la sienne). */
function localBaseUri(uri) {
  const match = /^(mongodb:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?)(?:\/[\w-]*)?$/.exec(uri);
  if (!match) throw new Error(`MONGO_TEST_URI doit désigner une base MongoDB locale (reçu : ${uri.replace(/\/\/[^@]*@/, '//***@')})`);
  return match[1];
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

/* Démarre un serveur Hive isolé. Renvoie { url, db, mails, stop, logs }. */
async function startServer(name, env = {}) {
  const port = await freePort();
  const dbName = `hive_e2e_${name}_${process.pid}`;
  const mongoUri = `${localBaseUri(BASE_URI)}/${dbName}`;
  const mailFile = path.join(os.tmpdir(), `hive-mails-${dbName}.jsonl`);
  fs.writeFileSync(mailFile, '');

  const db = await mongoose.createConnection(mongoUri).asPromise();
  await db.dropDatabase();

  const logs = [];
  const child = spawn(process.execPath, ['-r', path.join(__dirname, 'captureMail.js'), 'server.js'], {
    cwd: BACKEND_DIR,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(port),
      MONGO_URI: mongoUri,
      JWT_SECRET,
      FRONT_URL: 'http://localhost:3999',
      BACKEND_URL: `http://127.0.0.1:${port}`,
      MAIL_CAPTURE_FILE: mailFile,
      MAIL_FROM_EMAIL: 'noreply@hive-app.ch',
      STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
      STRIPE_SECRET_KEY: STRIPE_TEST_KEY,
      MAIL_USER: '', MAIL_PASS: '',
      CODE_RESEND_COOLDOWN_MS: '0',
      // Le dépôt peut contenir un .env de développement : ces variables le neutralisent.
      GOOGLE_CLIENT_ID: '', GITHUB_CLIENT_ID: '',
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (d) => logs.push(String(d)));
  child.stderr.on('data', (d) => logs.push(String(d)));

  const url = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 20000;
  for (;;) {
    if (child.exitCode !== null) throw new Error(`Le serveur s'est arrêté :\n${logs.join('')}`);
    try {
      const res = await fetch(`${url}/health`);
      if (res.ok) break;
    } catch { /* pas encore prêt */ }
    if (Date.now() > deadline) throw new Error(`Serveur non prêt :\n${logs.join('')}`);
    await new Promise((r) => setTimeout(r, 150));
  }

  const mails = {
    all: () => fs.readFileSync(mailFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)),
    to: (email) => mails.all().filter((m) => m.to === email),
    last: (email) => mails.to(email).at(-1),
    code: (email) => {
      const m = mails.last(email);
      const match = m && />\s*(\d{6})\s*</.exec(m.html);
      return match ? match[1] : null;
    },
  };

  const stop = async () => {
    child.kill('SIGTERM');
    await new Promise((r) => (child.exitCode !== null ? r() : child.once('exit', r)));
    await db.dropDatabase().catch(() => {});
    await db.close();
    fs.rmSync(mailFile, { force: true });
  };

  return { url, db, mails, stop, logs, port };
}

/* Client HTTP minimal : renvoie { status, body, headers }. Chaque client a sa propre « IP » (X-Forwarded-For). */
function client(url, token, ip = randomIp()) {
  const call = async (method, p, body, extraHeaders = {}) => {
    const res = await fetch(`${url}/api${p}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'X-Forwarded-For': ip,
        'CF-Connecting-IP': ip,
        ...extraHeaders,
      },
      body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)),
    });
    const text = await res.text();
    let parsed = text;
    try { parsed = JSON.parse(text); } catch { /* texte brut */ }
    return { status: res.status, body: parsed, headers: res.headers };
  };
  return {
    ip,
    get: (p, h) => call('GET', p, undefined, h),
    post: (p, b = {}, h) => call('POST', p, b, h),
    put: (p, b = {}, h) => call('PUT', p, b, h),
    patch: (p, b = {}, h) => call('PATCH', p, b, h),
    del: (p, b, h) => call('DELETE', p, b, h),
  };
}

function randomIp() {
  return `10.${crypto.randomInt(255)}.${crypto.randomInt(255)}.${crypto.randomInt(1, 255)}`;
}

let counter = 0;
const uniqueEmail = (label) => `${label}.${process.pid}.${Date.now()}.${counter++}@test.hive`;

/* Inscription complète : register → code OTP reçu par email → vérification → connexion. */
async function signUp(server, label = 'user', profile = {}) {
  const email = uniqueEmail(label);
  const anon = client(server.url);
  const reg = await anon.post('/auth/register', { email, password: PASSWORD, acceptTerms: true });
  if (reg.status !== 201) throw new Error(`register ${reg.status} ${JSON.stringify(reg.body)}`);
  const code = server.mails.code(email);
  const ver = await anon.post('/auth/verify-email', { email, code });
  if (ver.status !== 200) throw new Error(`verify ${ver.status} ${JSON.stringify(ver.body)}`);
  const login = await anon.post('/auth/login', { email, password: PASSWORD });
  if (login.status !== 200) throw new Error(`login ${login.status} ${JSON.stringify(login.body)}`);
  const { token } = login.body;
  const id = String(login.body.user._id);
  const api = client(server.url, token, anon.ip);
  const name = profile.displayName || label.charAt(0).toUpperCase() + label.slice(1);
  await api.put('/user/profile', { displayName: name, firstName: name, ...profile });
  return { email, password: PASSWORD, token, id, api, name };
}

/* Payload projet valide (le front envoie projectMeta.region = pays) */
function projectPayload(overrides = {}) {
  const start = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  return {
    title: 'Atelier vélo solidaire',
    description: 'On répare des vélos pour les offrir.',
    tags: ['sport', 'social'],
    requiredSkills: ['mécanique'],
    langues: ['fr'],
    maxParticipants: 5,
    visibility: 'public',
    location: { coordinates: [6.1432, 46.2044] },
    projectMeta: { city: 'Genève', region: 'Suisse', startDate: start },
    ...overrides,
  };
}

/* Socket connecté avec le jeton ; attend la connexion. */
async function connectSocket(server, token) {
  const socket = ioClient(server.url, { auth: { token }, transports: ['websocket'], forceNew: true, reconnection: false });
  await new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });
  return socket;
}

/* Attend un événement Socket.io (avec filtre), rejette après `ms`. */
function waitFor(socket, event, predicate = () => true, ms = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off(event, handler); reject(new Error(`timeout ${event}`)); }, ms);
    function handler(payload) {
      if (!predicate(payload)) return;
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(payload);
    }
    socket.on(event, handler);
  });
}

/* Vérifie qu'AUCUN événement correspondant n'arrive pendant `ms`. */
function expectNone(socket, event, predicate = () => true, ms = 600) {
  return new Promise((resolve, reject) => {
    const handler = (payload) => {
      if (!predicate(payload)) return;
      socket.off(event, handler);
      reject(new Error(`événement inattendu ${event} : ${JSON.stringify(payload).slice(0, 200)}`));
    };
    socket.on(event, handler);
    setTimeout(() => { socket.off(event, handler); resolve(); }, ms);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = {
  skip, startServer, client, signUp, projectPayload, connectSocket, waitFor, expectNone, sleep,
  uniqueEmail, randomIp, PASSWORD, JWT_SECRET, WEBHOOK_SECRET, STRIPE_TEST_KEY,
};
