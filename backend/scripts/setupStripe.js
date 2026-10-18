/* Configuration automatique du compte Stripe pour Hive+ (idempotente : peut être relancée).
   Crée ou retrouve : produits et prix (Hive+ mensuel/annuel, Boost), coupon « fondateurs »,
   configuration du portail client, TWINT si disponible, endpoint webhook.
   Puis écrit les identifiants dans .env (sauvegarde .env.backup-<date> faite avant).

   Usage : node backend/scripts/setupStripe.js [--webhook-url=https://…/api/billing/webhook] [--live]
   Lit STRIPE_SECRET_KEY dans .env. Refuse une clé « live » sans --live. N'affiche jamais la clé. */
const fs = require('fs');
const path = require('path');
const Stripe = require('stripe');

const ENV_PATH = path.join(__dirname, '..', '..', '.env');
require('dotenv').config({ path: ENV_PATH });

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v ?? true];
}));
// L'API tourne sur Render (le site statique hive-app.ch ne relaie pas /api) : c'est elle que Stripe doit joindre
const WEBHOOK_URL = args['webhook-url'] || 'https://hive-1-bkab.onrender.com/api/billing/webhook';
const EVENTS = [
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.paid',
  'charge.refunded', // Boost remboursé : la mise en avant est retirée
];

const key = process.env.STRIPE_SECRET_KEY || '';
// Clé secrète (sk_…) ou restreinte (rk_…, « accès complet sauf opérations sensibles »)
if (!/^[sr]k_(test|live)_/.test(key) || key.includes('replace')) {
  console.error('✗ Ajoute d\'abord ta clé secrète dans .env : STRIPE_SECRET_KEY=sk_test_…');
  process.exit(1);
}
const isLive = /^[sr]k_live_/.test(key);
if (isLive && !args.live) {
  console.error('✗ Clé LIVE détectée. Relance avec --live si c\'est voulu (sinon utilise sk_test_…).');
  process.exit(1);
}
const stripe = Stripe(key);
const mode = isLive ? 'LIVE' : 'test';

/* Remplace ou ajoute des variables dans .env, après sauvegarde */
function writeEnv(values) {
  const original = fs.readFileSync(ENV_PATH, 'utf8');
  const backup = `${ENV_PATH}.backup-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  fs.writeFileSync(backup, original, { mode: 0o600 });
  let text = original.endsWith('\n') ? original : `${original}\n`;
  const added = [];
  for (const [k, v] of Object.entries(values)) {
    const line = `${k}=${v}`;
    const re = new RegExp(`^${k}=.*$`, 'm');
    if (re.test(text)) text = text.replace(re, line);
    else added.push(line);
  }
  if (added.length) text += `\n# --- Stripe (généré par backend/scripts/setupStripe.js) ---\n${added.join('\n')}\n`;
  fs.writeFileSync(ENV_PATH, text, { mode: 0o600 });
  return path.basename(backup);
}

/* Prix identifié par sa lookup_key : retrouvé s'il existe, créé sinon */
async function ensurePrice({ lookupKey, product, amount, recurring }) {
  const found = await stripe.prices.list({ lookup_keys: [lookupKey], limit: 1 });
  if (found.data[0]) return found.data[0];
  return stripe.prices.create({ product, currency: 'chf', unit_amount: amount, lookup_key: lookupKey, ...(recurring ? { recurring } : {}) });
}

async function ensureProduct(id, name, description) {
  try {
    return await stripe.products.retrieve(id);
  } catch {
    return stripe.products.create({ id, name, description, metadata: { app: 'hive' } });
  }
}

(async () => {
  console.log(`Configuration Stripe (mode ${mode})…`);
  const env = {};

  // 1. Produits et prix
  const plus = await ensureProduct('hive_plus', 'Hive+', 'Boosts mensuels, statistiques de projet et badge Hive+.');
  const boost = await ensureProduct('hive_boost', 'Boost 48 h', 'Projet mis en avant pendant 48 heures.');
  const monthly = await ensurePrice({ lookupKey: 'hive_plus_monthly', product: plus.id, amount: 590, recurring: { interval: 'month' } });
  const yearly = await ensurePrice({ lookupKey: 'hive_plus_yearly', product: plus.id, amount: 4900, recurring: { interval: 'year' } });
  const boostPrice = await ensurePrice({ lookupKey: 'hive_boost_48h', product: boost.id, amount: 390 });
  env.STRIPE_PRICE_PLUS_MONTHLY = monthly.id;
  env.STRIPE_PRICE_PLUS_YEARLY = yearly.id;
  env.STRIPE_PRICE_BOOST = boostPrice.id;
  console.log('✓ Produits et prix : Hive+ 5.90 CHF/mois, 49 CHF/an ; Boost 3.90 CHF');

  // 2. Coupon « membres fondateurs » (-30 % à vie)
  const couponId = 'HIVE_FOUNDERS_30';
  try {
    await stripe.coupons.retrieve(couponId);
  } catch {
    await stripe.coupons.create({ id: couponId, name: 'Membres fondateurs', percent_off: 30, duration: 'forever' });
  }
  env.STRIPE_FOUNDERS_COUPON = couponId;
  if (!process.env.FOUNDERS_OFFER_ENDS_AT) env.FOUNDERS_OFFER_ENDS_AT = '2026-12-31T22:59:59Z';
  if (!process.env.FOUNDERS_PERCENT_OFF) env.FOUNDERS_PERCENT_OFF = '30';
  console.log('✓ Coupon fondateurs : -30 % à vie');

  // 3. Portail client (résiliation en fin de période, factures, moyen de paiement)
  const front = (process.env.FRONT_URL || 'https://hive-app.ch').replace(/\/$/, '');
  const portalSettings = {
    business_profile: { headline: 'Gérer ton abonnement Hive+' },
    default_return_url: `${front}/profile`,
    features: {
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      customer_update: { enabled: true, allowed_updates: ['email', 'address'] },
      subscription_cancel: { enabled: true, mode: 'at_period_end' },
    },
    metadata: { app: 'hive' },
  };
  const portals = await stripe.billingPortal.configurations.list({ limit: 100 });
  const existingPortal = portals.data.find((c) => c.metadata?.app === 'hive' && c.active);
  const portal = existingPortal
    ? await stripe.billingPortal.configurations.update(existingPortal.id, portalSettings)
    : await stripe.billingPortal.configurations.create(portalSettings);
  env.STRIPE_PORTAL_CONFIG = portal.id;
  console.log('✓ Portail client configuré');

  // 4. TWINT (selon l'éligibilité du compte)
  try {
    const configs = await stripe.paymentMethodConfigurations.list({ limit: 10 });
    const main = configs.data.find((c) => c.is_default) || configs.data[0];
    if (main) {
      await stripe.paymentMethodConfigurations.update(main.id, { twint: { display_preference: { preference: 'on' } } });
      console.log('✓ TWINT activé');
    }
  } catch (err) {
    console.log(`! TWINT non activé automatiquement (${err.message.split('.')[0]}). À activer à la main : Paramètres → Moyens de paiement.`);
  }

  // 5. Webhook (le secret n'est lisible qu'à la création : on recrée l'endpoint Hive si le secret manque)
  const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
  const existing = endpoints.data.find((e) => e.url === WEBHOOK_URL);
  const haveSecret = /^whsec_/.test(process.env.STRIPE_WEBHOOK_SECRET || '') && !process.env.STRIPE_WEBHOOK_SECRET.includes('replace');
  if (existing && haveSecret) {
    await stripe.webhookEndpoints.update(existing.id, { enabled_events: EVENTS });
    console.log(`✓ Webhook existant mis à jour : ${WEBHOOK_URL}`);
  } else {
    if (existing && existing.metadata?.app === 'hive') await stripe.webhookEndpoints.del(existing.id);
    else if (existing) {
      console.error(`✗ Un webhook non créé par ce script existe déjà pour ${WEBHOOK_URL}. Copie son secret (whsec_…) dans STRIPE_WEBHOOK_SECRET puis relance.`);
      process.exit(1);
    }
    const created = await stripe.webhookEndpoints.create({ url: WEBHOOK_URL, enabled_events: EVENTS, metadata: { app: 'hive' }, description: 'Hive+ (abonnements et boosts)' });
    env.STRIPE_WEBHOOK_SECRET = created.secret;
    console.log(`✓ Webhook créé : ${WEBHOOK_URL}`);
  }

  const backup = writeEnv(env);
  console.log(`✓ .env mis à jour (${Object.keys(env).length} variables) — sauvegarde : ${backup}`);
  console.log('\nTerminé. Redémarre le backend : la page /abonnement passe de « Bientôt disponible » à « Passer à Hive+ ».');
})().catch((err) => {
  console.error('✗ Échec :', err.message);
  process.exit(1);
});
