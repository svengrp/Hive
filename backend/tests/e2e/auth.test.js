/* Inscription, code OTP, connexion, verrouillage, mot de passe oublié / changement, session. */
const test = require('node:test');
const assert = require('node:assert');
const { skip, startServer, client, signUp, uniqueEmail, PASSWORD } = require('./helpers');

test('authentification', { skip }, async (t) => {
  const server = await startServer('auth');
  t.after(() => server.stop());
  const anon = () => client(server.url);

  await t.test('inscription : validations', async () => {
    const api = anon();
    const email = uniqueEmail('val');
    assert.strictEqual((await api.post('/auth/register', {})).status, 400, 'champs manquants');
    assert.strictEqual((await api.post('/auth/register', { email, password: PASSWORD })).status, 400, 'conditions non acceptées');
    assert.strictEqual((await api.post('/auth/register', { email: 'pas-un-email', password: PASSWORD, acceptTerms: true })).status, 400, 'email invalide');
    assert.strictEqual((await api.post('/auth/register', { email, password: 'faible', acceptTerms: true })).status, 400, 'mot de passe faible');
    const injected = await api.post('/auth/register', { email: { $gt: '' }, password: PASSWORD, acceptTerms: true });
    assert.strictEqual(injected.status, 400, `email objet : ${injected.status}`);
  });

  await t.test('inscription → email avec code à 6 chiffres → vérification', async () => {
    const api = anon();
    const email = uniqueEmail('Lea').toUpperCase();
    const reg = await api.post('/auth/register', { email: `  ${email} `, password: PASSWORD, acceptTerms: true });
    assert.strictEqual(reg.status, 201);
    const normalized = email.toLowerCase();
    assert.strictEqual(reg.body.email, normalized, 'email normalisé');
    const mail = server.mails.last(normalized);
    assert.ok(mail, 'email de vérification envoyé');
    const code = server.mails.code(normalized);
    assert.match(code, /^\d{6}$/);

    assert.strictEqual((await api.post('/auth/verify-email', { email: normalized, code: code === '000000' ? '111111' : '000000' })).status, 400, 'mauvais code');
    assert.strictEqual((await api.post('/auth/verify-email', { email: normalized, code })).status, 200, 'bon code');
    assert.strictEqual((await api.post('/auth/verify-email', { email: normalized, code })).status, 400, 'code à usage unique');
    assert.strictEqual((await api.post('/auth/register', { email: normalized, password: PASSWORD, acceptTerms: true })).status, 409, 'email déjà utilisé');
  });

  await t.test('connexion refusée tant que l\'email n\'est pas vérifié', async () => {
    const api = anon();
    const email = uniqueEmail('unverified');
    await api.post('/auth/register', { email, password: PASSWORD, acceptTerms: true });
    const login = await api.post('/auth/login', { email, password: PASSWORD });
    assert.strictEqual(login.status, 403, `connexion sans vérification : ${login.status}`);
    assert.ok(!login.body.token, 'aucun jeton délivré');
    assert.strictEqual(login.body.code, 'email_not_verified');
  });

  await t.test('code OTP : bloqué après 5 essais faux (anti force brute)', async () => {
    const api = anon();
    const email = uniqueEmail('otpbrute');
    await api.post('/auth/register', { email, password: PASSWORD, acceptTerms: true });
    const code = server.mails.code(email);
    const wrong = code === '123456' ? '654321' : '123456';
    for (let i = 0; i < 5; i += 1) await client(server.url).post('/auth/verify-email', { email, code: wrong });
    const after = await client(server.url).post('/auth/verify-email', { email, code });
    assert.strictEqual(after.status, 429, `le bon code reste accepté après 5 essais faux : ${after.status}`);
    // Un nouveau code débloque
    await api.post('/auth/resend-verification-email', { email });
    const fresh = server.mails.code(email);
    assert.strictEqual((await api.post('/auth/verify-email', { email, code: fresh })).status, 200);
  });

  await t.test('connexion : réponse sans secrets, jeton valide', async () => {
    const u = await signUp(server, 'secret');
    const login = await anon().post('/auth/login', { email: u.email, password: PASSWORD });
    assert.strictEqual(login.status, 200);
    for (const field of ['passwordHash', 'resetCodeHash', 'emailVerificationCodeHash', 'twoFactorCode', 'loginAttempts', 'lockUntil', 'messageEmailSentAt']) {
      assert.ok(!(field in login.body.user), `champ sensible exposé : ${field}`);
    }
    const me = await u.api.get('/auth/me');
    assert.strictEqual(me.status, 200);
    assert.strictEqual(me.body.user.email, u.email);
    assert.ok(!('passwordHash' in me.body.user));
  });

  await t.test('connexion : injection NoSQL refusée', async () => {
    const res = await anon().post('/auth/login', { email: { $ne: null }, password: { $ne: null } });
    assert.ok([400, 401].includes(res.status), `statut ${res.status}`);
    assert.ok(!res.body.token);
  });

  await t.test('verrouillage après 5 mots de passe faux', async () => {
    const u = await signUp(server, 'lock');
    let last;
    for (let i = 0; i < 5; i += 1) last = await client(server.url).post('/auth/login', { email: u.email, password: 'Mauvais.1' });
    assert.strictEqual(last.status, 423);
    const good = await client(server.url).post('/auth/login', { email: u.email, password: PASSWORD });
    assert.strictEqual(good.status, 423, 'même le bon mot de passe est refusé pendant le verrouillage');
  });

  await t.test('limite de débit par IP (et seulement par IP)', async () => {
    const same = client(server.url);
    const statuses = [];
    for (let i = 0; i < 12; i += 1) statuses.push((await same.post('/auth/login', { email: uniqueEmail('rl'), password: 'x' })).status);
    assert.ok(statuses.includes(429), `aucun 429 depuis la même IP : ${statuses}`);
    // Une autre personne (autre IP) n'est pas pénalisée
    const other = await client(server.url).post('/auth/login', { email: uniqueEmail('rl2'), password: 'x' });
    assert.strictEqual(other.status, 401, `une autre IP est bloquée : ${other.status}`);
  });

  await t.test('mot de passe oublié : code, essais limités, mot de passe fort exigé', async () => {
    const u = await signUp(server, 'reset');
    const api = anon();
    const unknown = await api.post('/auth/forgot-password', { email: uniqueEmail('nobody') });
    const known = await api.post('/auth/forgot-password', { email: u.email });
    assert.strictEqual(unknown.status, 200);
    assert.deepStrictEqual(unknown.body, known.body, 'même réponse (pas d\'énumération)');
    const code = server.mails.code(u.email);
    assert.match(code, /^\d{6}$/);

    assert.strictEqual((await api.post('/auth/verify-reset-code', { email: u.email, code })).status, 200);
    const weak = await api.post('/auth/reset-password', { email: u.email, code, newPassword: '123' });
    assert.strictEqual(weak.status, 400, `mot de passe faible accepté : ${weak.status}`);

    const reset = await api.post('/auth/reset-password', { email: u.email, code, newPassword: 'Nouveau.Pass2' });
    assert.strictEqual(reset.status, 200);
    assert.strictEqual((await api.post('/auth/reset-password', { email: u.email, code, newPassword: 'Autre.Pass3' })).status, 400, 'code à usage unique');
    assert.strictEqual((await client(server.url).post('/auth/login', { email: u.email, password: PASSWORD })).status, 401, 'ancien mot de passe');
    assert.strictEqual((await client(server.url).post('/auth/login', { email: u.email, password: 'Nouveau.Pass2' })).status, 200, 'nouveau mot de passe');
    // L'ancien jeton (émis avant le changement) ne doit plus fonctionner
    assert.strictEqual((await u.api.get('/auth/me')).status, 401, 'ancienne session encore valide après réinitialisation');
  });

  await t.test('mot de passe oublié : force brute du code bloquée', async () => {
    const u = await signUp(server, 'resetbrute');
    await anon().post('/auth/forgot-password', { email: u.email });
    const code = server.mails.code(u.email);
    const wrong = code === '123456' ? '654321' : '123456';
    for (let i = 0; i < 5; i += 1) await client(server.url).post('/auth/verify-reset-code', { email: u.email, code: wrong });
    const res = await client(server.url).post('/auth/reset-password', { email: u.email, code, newPassword: 'Pirate.Pass9' });
    assert.notStrictEqual(res.status, 200, 'mot de passe changé après 5 essais faux');
  });

  await t.test('changement de mot de passe depuis le profil', async () => {
    const u = await signUp(server, 'change');
    assert.strictEqual((await u.api.put('/user/password', { currentPassword: 'Faux.Pass1', newPassword: 'Nouveau.Pass2' })).status, 401);
    const weak = await u.api.put('/user/password', { currentPassword: PASSWORD, newPassword: 'abc' });
    assert.strictEqual(weak.status, 400, `mot de passe faible accepté : ${weak.status}`);
    assert.strictEqual((await u.api.put('/user/password', { currentPassword: PASSWORD, newPassword: 'Nouveau.Pass2' })).status, 200);
    assert.strictEqual((await client(server.url).post('/auth/login', { email: u.email, password: 'Nouveau.Pass2' })).status, 200);
  });

  await t.test('jetons invalides', async () => {
    assert.strictEqual((await client(server.url, 'abc.def.ghi').get('/auth/me')).status, 401);
    const none = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from('{"id":"000000000000000000000000","role":"admin"}').toString('base64url')}.`;
    assert.strictEqual((await client(server.url, none).get('/admin/users')).status, 401, 'alg none accepté');
  });

  await t.test('email de vérification : charte actuelle (logo bleu), pas d\'orange', async () => {
    const email = uniqueEmail('brand');
    await anon().post('/auth/register', { email, password: PASSWORD, acceptTerms: true });
    const { html, subject } = server.mails.last(email);
    assert.ok(subject);
    assert.ok(!/#(a0560d|b8650f|faf6f0|2b2016|4a3b2c)/i.test(html), 'couleur orange/brune de l\'ancienne palette');
    assert.match(html, /logo192\.png/, 'logo Hive absent');
    assert.match(html, /#16181d/i, 'graphite de la charte absent');
  });
});
