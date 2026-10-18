/* Paiements Hive+ et Boost : webhooks Stripe signés (droits accordés uniquement par webhook),
   idempotence, crédits de boost (plafond, dépense atomique), statistiques Hive+, Checkout en mode test.
   La création de session Checkout appelle l'API Stripe uniquement avec une clé sk_test_. */
const test = require('node:test');
const assert = require('node:assert');
const Stripe = require('stripe');
const { skip, startServer, client, signUp, projectPayload, WEBHOOK_SECRET, STRIPE_TEST_KEY } = require('./helpers');

const stripe = new Stripe('sk_test_signing_only');
let seq = 0;

async function sendEvent(server, type, object, id = `evt_test_${Date.now()}_${seq++}`) {
  const payload = JSON.stringify({ id, object: 'event', type, data: { object } });
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
  const res = await fetch(`${server.url}/api/billing/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Stripe-Signature': header },
    body: payload,
  });
  return { status: res.status, body: await res.json().catch(() => null), id };
}

const subscription = (user, status = 'active', extra = {}) => ({
  id: `sub_${user.id}`,
  object: 'subscription',
  customer: `cus_${user.id}`,
  status,
  cancel_at_period_end: false,
  current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
  metadata: { userId: user.id, product: 'plus_monthly' },
  ...extra,
});

test('paiements Hive+ et Boost', { skip }, async (t) => {
  const server = await startServer('billing');
  t.after(() => server.stop());
  const [lea, max] = await Promise.all(['lea', 'max'].map((n) => signUp(server, n)));
  const leaProject = (await lea.api.post('/projects/create', projectPayload({ title: 'Projet de Léa' }))).body;
  const maxProject = (await max.api.post('/projects/create', projectPayload({ title: 'Projet de Max' }))).body;

  await t.test('offres publiques, état de l\'abonnement privé', async () => {
    const plans = await client(server.url).get('/billing/plans');
    assert.strictEqual(plans.status, 200);
    assert.strictEqual(plans.body.prices.plus_monthly.currency, 'chf');
    assert.strictEqual((await client(server.url).get('/billing/me')).status, 401);
    const me = await lea.api.get('/billing/me');
    assert.strictEqual(me.body.plan, 'free');
    assert.ok(!('stripeCustomerId' in me.body), 'identifiant client Stripe exposé');
  });

  await t.test('webhook : signature obligatoire', async () => {
    const forged = await fetch(`${server.url}/api/billing/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Stripe-Signature': 't=1,v1=deadbeef' },
      body: JSON.stringify({ id: 'evt_forged', type: 'customer.subscription.created', data: { object: subscription(lea) } }),
    });
    assert.strictEqual(forged.status, 400);
    const unsigned = await fetch(`${server.url}/api/billing/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.strictEqual(unsigned.status, 400);
    assert.strictEqual((await lea.api.get('/billing/me')).body.plan, 'free');
  });

  await t.test('les fonctions Hive+ restent verrouillées sans abonnement', async () => {
    assert.strictEqual((await lea.api.post(`/billing/boost/${leaProject._id}`)).status, 402);
    assert.deepStrictEqual((await lea.api.get(`/projects/${leaProject._id}/stats`)).body, { locked: true });
    assert.strictEqual((await max.api.get(`/projects/${leaProject._id}/stats`)).status, 403);
  });

  await t.test('abonnement activé par webhook ; renvoi du même événement sans effet', async () => {
    const ev = await sendEvent(server, 'customer.subscription.created', subscription(lea));
    assert.strictEqual(ev.status, 200);
    const me = (await lea.api.get('/billing/me')).body;
    assert.strictEqual(me.plan, 'plus');
    assert.strictEqual(me.planStatus, 'active');
    assert.ok(new Date(me.planRenewsAt) > new Date());

    const invoice = { object: 'invoice', customer: `cus_${lea.id}`, subscription: `sub_${lea.id}` };
    const paid = await sendEvent(server, 'invoice.paid', invoice);
    assert.strictEqual((await lea.api.get('/billing/me')).body.boostCredits, 2);
    const replay = await sendEvent(server, 'invoice.paid', invoice, paid.id);
    assert.strictEqual(replay.body.duplicate, true);
    assert.strictEqual((await lea.api.get('/billing/me')).body.boostCredits, 2, 'événement rejoué crédité deux fois');
    for (let i = 0; i < 5; i += 1) await sendEvent(server, 'invoice.paid', invoice);
    assert.strictEqual((await lea.api.get('/billing/me')).body.boostCredits, 6, 'plafond de 6 boosts');
  });

  await t.test('boost inclus : propre projet ouvert seulement, dépense atomique', async () => {
    assert.strictEqual((await lea.api.post(`/billing/boost/${maxProject._id}`)).status, 403, 'projet d\'autrui');
    assert.strictEqual((await lea.api.post('/billing/boost/pas-un-id')).status, 400);
    await server.db.collection('users').updateOne({ email: lea.email }, { $set: { boostCredits: 2 } });
    const results = await Promise.all(Array.from({ length: 10 }, () => lea.api.post(`/billing/boost/${leaProject._id}`)));
    assert.strictEqual(results.filter((r) => r.status === 200).length, 2, 'plus de boosts dépensés que de crédits');
    assert.strictEqual((await lea.api.get('/billing/me')).body.boostCredits, 0);
    const boosted = await client(server.url).get('/projects/boosted');
    assert.ok(boosted.body.some((p) => p._id === leaProject._id));
    const until = new Date(boosted.body.find((p) => p._id === leaProject._id).boostedUntil);
    const hours = (until - Date.now()) / 3600000;
    assert.ok(hours > 95 && hours <= 96.1, `deux boosts cumulés = 96 h (reçu ${hours.toFixed(1)} h)`);
  });

  await t.test('statistiques détaillées pour Hive+', async () => {
    await max.api.post(`/projects/${leaProject._id}/view`);
    const stats = await lea.api.get(`/projects/${leaProject._id}/stats`);
    assert.strictEqual(stats.body.locked, false);
    assert.ok(stats.body.views7 >= 1);
  });

  await t.test('achat d\'un Boost (paiement unique) appliqué par webhook', async () => {
    const session = {
      object: 'checkout.session', mode: 'payment', payment_status: 'paid',
      metadata: { userId: max.id, product: 'boost', projectId: maxProject._id },
    };
    await sendEvent(server, 'checkout.session.completed', { ...session, payment_status: 'unpaid' });
    let p = (await client(server.url).get(`/projects/${maxProject._id}`)).body;
    assert.strictEqual(p.boostedUntil, null, 'boost appliqué sans paiement');
    await sendEvent(server, 'checkout.session.completed', session);
    p = (await client(server.url).get(`/projects/${maxProject._id}`)).body;
    assert.ok(new Date(p.boostedUntil) > new Date(Date.now() + 47 * 3600000));
  });

  await t.test('résiliation : retour au plan gratuit', async () => {
    await sendEvent(server, 'customer.subscription.updated', subscription(lea, 'active', { cancel_at_period_end: true }));
    assert.strictEqual((await lea.api.get('/billing/me')).body.planCancelAtPeriodEnd, true);
    await sendEvent(server, 'customer.subscription.deleted', subscription(lea, 'canceled'));
    const me = (await lea.api.get('/billing/me')).body;
    assert.strictEqual(me.plan, 'free');
    assert.deepStrictEqual((await lea.api.get(`/projects/${leaProject._id}/stats`)).body, { locked: true });
  });

  await t.test('paiement : validations avant tout appel à Stripe', async () => {
    const plans = (await client(server.url).get('/billing/plans')).body;
    if (!plans.enabled) return t.skip('Stripe non configuré');
    assert.strictEqual((await client(server.url).post('/billing/checkout', { product: 'plus_monthly' })).status, 401);
    assert.strictEqual((await lea.api.post('/billing/checkout', { product: 'gratuit_a_vie' })).status, 400);
    assert.strictEqual((await lea.api.post('/billing/checkout', { product: 'boost', projectId: maxProject._id })).status, 403);
    await sendEvent(server, 'customer.subscription.created', subscription(max));
    assert.strictEqual((await max.api.post('/billing/checkout', { product: 'plus_yearly' })).status, 409, 'double abonnement');
  });

  await t.test('Checkout Stripe (mode test) : session créée', { skip: !STRIPE_TEST_KEY && 'clé Stripe de test absente' }, async () => {
    // Compte neuf : les comptes ci-dessus ont reçu un faux client Stripe (cus_…) par les webhooks simulés.
    const zoe = await signUp(server, 'zoe');
    const zoeProject = (await zoe.api.post('/projects/create', projectPayload({ title: 'Projet de Zoé' }))).body;
    const res = await zoe.api.post('/billing/checkout', { product: 'plus_monthly' });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.match(res.body.url, /^https:\/\/checkout\.stripe\.com\//);
    const boost = await zoe.api.post('/billing/checkout', { product: 'boost', projectId: zoeProject._id });
    assert.strictEqual(boost.status, 200, JSON.stringify(boost.body));
  });
});
