/* Abonnement Hive+ et boosts de projet (Stripe Checkout + portail client + webhooks).
   Les droits (plan, crédits, mise en avant) ne sont accordés QUE par les webhooks signés :
   la page de retour « merci » n'est jamais une preuve de paiement. */
const mongoose = require('mongoose');
const User = require('../models/User');
const Project = require('../models/Project');
const StripeEvent = require('../models/StripeEvent');
const {
  getStripe, isEnabled, foundersOffer, displayPrices, PRODUCTS,
  BOOST_HOURS, BOOSTS_PER_INVOICE, MAX_BOOST_CREDITS, isPlus,
} = require('../utils/billing');

const front = () => process.env.FRONT_URL || 'http://localhost:3000';
const disabled = (res) => res.status(503).json({ code: 'billing_disabled', message: 'Les paiements ne sont pas encore activés.' });

/* Consentement sur la page de paiement Stripe : exécution immédiate et acceptation des conditions.
   Le texte au-dessus du bouton « Payer » est toujours affiché. La case à cocher Stripe n'est activée
   qu'avec STRIPE_TERMS_CONSENT=true : elle exige l'URL des conditions dans Stripe
   (Paramètres → Informations publiques), sinon Stripe refuse de créer le paiement. */
const checkoutConsent = () => {
  const terms = `${front()}/conditions`;
  const message = `En payant, tu demandes que le service démarre immédiatement. Hive+ se renouvelle automatiquement et se résilie à tout moment depuis ton profil ; la période en cours et les Boosts ne sont pas remboursables. Conditions : ${terms}`;
  if (process.env.STRIPE_TERMS_CONSENT !== 'true') {
    return { custom_text: { submit: { message } } };
  }
  return {
    consent_collection: { terms_of_service: 'required' },
    custom_text: {
      submit: { message: 'Le service démarre immédiatement après le paiement. Hive+ se renouvelle automatiquement et se résilie à tout moment depuis ton profil.' },
      terms_of_service_acceptance: { message: `J'accepte les [conditions d'utilisation et de vente](${terms}) et je demande l'activation immédiate ; la période en cours et les Boosts ne sont pas remboursables.` },
    },
  };
};

/* Prolonge la mise en avant d'un projet de BOOST_HOURS (à partir de maintenant ou de la fin du boost en cours) */
async function applyBoost(projectId) {
  const project = await Project.findById(projectId).select('boostedUntil');
  if (!project) return null;
  const from = Math.max(Date.now(), project.boostedUntil ? project.boostedUntil.getTime() : 0);
  project.boostedUntil = new Date(from + BOOST_HOURS * 3600 * 1000);
  await project.save();
  return project.boostedUntil;
}

// GET /billing/plans — offres affichées (public)
exports.getPlans = async (_req, res) => {
  const offer = foundersOffer();
  res.json({
    enabled: isEnabled(),
    prices: await displayPrices(),
    boostHours: BOOST_HOURS,
    boostsPerMonth: BOOSTS_PER_INVOICE,
    offer: offer ? { percentOff: offer.percentOff, endsAt: offer.endsAt } : null,
  });
};

// GET /billing/me — état de l'abonnement de l'utilisateur connecté
exports.getMine = async (req, res) => {
  const user = await User.findById(req.user.id).select('plan planStatus planRenewsAt planCancelAtPeriodEnd boostCredits stripeCustomerId');
  if (!user) return res.status(404).json({ message: 'Utilisateur introuvable' });
  res.json({
    plan: user.plan,
    planStatus: user.planStatus,
    planRenewsAt: user.planRenewsAt,
    planCancelAtPeriodEnd: user.planCancelAtPeriodEnd,
    boostCredits: user.boostCredits,
    hasCustomer: !!user.stripeCustomerId,
    enabled: isEnabled(),
  });
};

async function ensureCustomer(stripe, user) {
  if (user.stripeCustomerId) return user.stripeCustomerId;
  const customer = await stripe.customers.create({
    email: user.email,
    name: user.displayName || [user.firstName, user.lastName].filter(Boolean).join(' ') || undefined,
    metadata: { userId: String(user._id) },
  });
  user.stripeCustomerId = customer.id;
  await user.save();
  return customer.id;
}

// POST /billing/checkout { product: plus_monthly | plus_yearly | boost, projectId? } → { url }
exports.createCheckout = async (req, res) => {
  const stripe = getStripe();
  if (!stripe || !isEnabled()) return disabled(res);
  const { product, projectId } = req.body || {};
  const def = PRODUCTS[product];
  if (!def) return res.status(400).json({ message: 'Offre inconnue' });

  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'Utilisateur introuvable' });

    let successPath = '/abonnement?status=success';
    let cancelPath = '/abonnement?status=cancel';
    const metadata = { userId: String(user._id), product };

    if (def.mode === 'subscription' && isPlus(user) && ['active', 'trialing', 'past_due'].includes(user.planStatus)) {
      return res.status(409).json({ code: 'already_subscribed', message: 'Tu es déjà membre Hive+.' });
    }
    if (product === 'boost') {
      if (!mongoose.Types.ObjectId.isValid(projectId)) return res.status(400).json({ message: 'Projet invalide' });
      const project = await Project.findById(projectId).select('ownerId status');
      if (!project || String(project.ownerId) !== String(user._id)) return res.status(403).json({ message: 'Tu ne peux booster que tes propres projets' });
      if (project.status !== 'open') return res.status(400).json({ message: 'Seuls les projets ouverts peuvent être mis en avant' });
      metadata.projectId = String(project._id);
      successPath = `/projects/${project._id}?boost=success`;
      cancelPath = `/projects/${project._id}`;
    }

    const offer = foundersOffer();
    const session = await stripe.checkout.sessions.create({
      mode: def.mode,
      customer: await ensureCustomer(stripe, user),
      line_items: [{ price: process.env[def.priceEnv], quantity: 1 }],
      // Offre fondateurs sur l'abonnement ; sinon, codes promo saisis par l'utilisateur
      ...(def.mode === 'subscription' && offer?.couponId
        ? { discounts: [{ coupon: offer.couponId }] }
        : { allow_promotion_codes: true }),
      metadata,
      ...(def.mode === 'subscription'
        ? { subscription_data: { metadata } }
        : { payment_intent_data: { metadata } }),
      client_reference_id: String(user._id),
      locale: 'fr',
      ...checkoutConsent(),
      success_url: `${front()}${successPath}`,
      cancel_url: `${front()}${cancelPath}`,
    });
    return res.json({ url: session.url });
  } catch (err) {
    console.error('createCheckout error:', err.message);
    return res.status(502).json({ message: 'Le paiement n’a pas pu démarrer. Réessaie dans un instant.' });
  }
};

// POST /billing/portal → { url } — gérer / résilier l'abonnement, factures, moyen de paiement
exports.createPortal = async (req, res) => {
  const stripe = getStripe();
  if (!stripe) return disabled(res);
  try {
    const user = await User.findById(req.user.id).select('stripeCustomerId');
    if (!user?.stripeCustomerId) return res.status(400).json({ message: 'Aucun abonnement à gérer' });
    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${front()}/profile`,
      // Configuration créée par scripts/setupStripe.js (sinon : configuration par défaut du compte)
      ...(process.env.STRIPE_PORTAL_CONFIG ? { configuration: process.env.STRIPE_PORTAL_CONFIG } : {}),
    });
    return res.json({ url: session.url });
  } catch (err) {
    console.error('createPortal error:', err.message);
    return res.status(502).json({ message: 'Le portail de gestion est indisponible pour le moment.' });
  }
};

// POST /billing/boost/:projectId — utilise un boost inclus dans Hive+
exports.useBoostCredit = async (req, res) => {
  const { projectId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(projectId)) return res.status(400).json({ message: 'Projet invalide' });
  try {
    const project = await Project.findById(projectId).select('ownerId status');
    if (!project || String(project.ownerId) !== req.user.id) return res.status(403).json({ message: 'Tu ne peux booster que tes propres projets' });
    if (project.status !== 'open') return res.status(400).json({ message: 'Seuls les projets ouverts peuvent être mis en avant' });
    // Décrément atomique : impossible de dépenser deux fois le même crédit
    const user = await User.findOneAndUpdate(
      { _id: req.user.id, plan: 'plus', boostCredits: { $gt: 0 } },
      { $inc: { boostCredits: -1 } },
      { new: true }
    ).select('boostCredits');
    if (!user) return res.status(402).json({ code: 'no_credit', message: 'Aucun boost disponible' });
    const boostedUntil = await applyBoost(projectId);
    return res.json({ boostedUntil, boostCredits: user.boostCredits });
  } catch (err) {
    console.error('useBoostCredit error:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
};

/* ── Webhooks ───────────────────────────────────────────────────────────── */
const periodEnd = (sub) => {
  const seconds = sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end;
  return seconds ? new Date(seconds * 1000) : null;
};

async function syncSubscription(sub) {
  const active = ['active', 'trialing', 'past_due'].includes(sub.status);
  const filter = sub.metadata?.userId ? { _id: sub.metadata.userId } : { stripeCustomerId: sub.customer };
  await User.updateOne(filter, {
    $set: {
      plan: active ? 'plus' : 'free',
      planStatus: sub.status,
      planRenewsAt: periodEnd(sub),
      planCancelAtPeriodEnd: !!sub.cancel_at_period_end,
      stripeSubscriptionId: sub.id,
      stripeCustomerId: sub.customer,
    },
  });
}

// POST /billing/webhook (corps brut, signature Stripe vérifiée)
exports.webhook = async (req, res) => {
  const stripe = getStripe();
  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) return disabled(res);

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Signature invalide : ${err.message}`);
  }

  // Idempotence : un événement déjà traité est ignoré
  try {
    await StripeEvent.create({ _id: event.id, type: event.type });
  } catch (err) {
    if (err.code === 11000) return res.json({ received: true, duplicate: true });
    throw err;
  }

  try {
    const obj = event.data.object;
    switch (event.type) {
      case 'checkout.session.completed': {
        if (obj.mode === 'payment' && obj.metadata?.product === 'boost' && obj.payment_status === 'paid') {
          await applyBoost(obj.metadata.projectId);
        }
        if (obj.mode === 'subscription' && obj.subscription) {
          await syncSubscription(await stripe.subscriptions.retrieve(obj.subscription));
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await syncSubscription(obj);
        break;
      case 'invoice.paid': {
        // Chaque facture d'abonnement payée crédite les boosts inclus (plafonnés)
        if (obj.subscription || obj.parent?.subscription_details) {
          const user = await User.findOne({ stripeCustomerId: obj.customer }).select('boostCredits');
          if (user) {
            user.boostCredits = Math.min(MAX_BOOST_CREDITS, (user.boostCredits || 0) + BOOSTS_PER_INVOICE);
            await user.save();
          }
        }
        break;
      }
      default:
        break;
    }
    return res.json({ received: true });
  } catch (err) {
    console.error(`webhook ${event.type} error:`, err);
    // On retire l'événement du journal pour que Stripe puisse le renvoyer
    await StripeEvent.deleteOne({ _id: event.id }).catch(() => {});
    return res.status(500).json({ message: 'Erreur de traitement' });
  }
};
