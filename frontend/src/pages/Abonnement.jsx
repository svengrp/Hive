import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Check, CircleAlert, Clock, Rocket } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { fetchMyBilling, fetchPlans, formatPrice, openPortal, startCheckout } from "../lib/billing";
import { useSeo } from "../lib/seo";
import classes from "./Abonnement.module.css";

/* Marque Hive (trois alvéoles) pour signer l'offre Hive+ */
function HiveMark() {
  return (
    <svg className={classes.mark} viewBox="0 0 64 64" aria-hidden="true">
      <polygon points="20.22,11.20 29.40,16.50 29.40,27.10 20.22,32.40 11.04,27.10 11.04,16.50" />
      <polygon points="43.78,11.20 52.96,16.50 52.96,27.10 43.78,32.40 34.60,27.10 34.60,16.50" />
      <polygon points="32.00,31.70 41.09,36.95 41.09,47.45 32.00,52.70 22.91,47.45 22.91,36.95" className={classes.markOutline} />
    </svg>
  );
}

/* Compte à rebours réel vers la fin de l'offre fondateurs (disparaît à l'échéance) */
function Countdown({ endsAt, onEnd }) {
  const { t } = useTranslation();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const left = Math.max(0, new Date(endsAt).getTime() - now);
  useEffect(() => { if (left === 0) onEnd(); }, [left, onEnd]);
  const parts = [
    [Math.floor(left / 86400000), t("billing.days")],
    [Math.floor((left / 3600000) % 24), t("billing.hours")],
    [Math.floor((left / 60000) % 60), t("billing.minutes")],
    [Math.floor((left / 1000) % 60), t("billing.seconds")],
  ];
  return (
    <span className={classes.countdown} role="timer" aria-live="off">
      {parts.map(([value, unit]) => (
        <span key={unit} className={classes.countdownPart}>
          <span className={classes.countdownValue}>{String(value).padStart(2, "0")}</span>
          <span className={classes.countdownUnit}>{unit}</span>
        </span>
      ))}
    </span>
  );
}

export default function Abonnement() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  useSeo({ title: t("seo.billingTitle"), description: t("seo.billingDescription"), path: "/abonnement" });
  const [searchParams] = useSearchParams();
  const status = searchParams.get("status");
  const [plans, setPlans] = useState(null);
  const [me, setMe] = useState(null);
  const [cycle, setCycle] = useState("monthly");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [offerOver, setOfferOver] = useState(false);
  const lang = i18n.language;

  useEffect(() => {
    fetchPlans().then(setPlans).catch(() => setPlans({ enabled: false, prices: null, offer: null }));
  }, []);

  // État de l'abonnement ; après un paiement, on attend la confirmation du webhook (20 s max)
  useEffect(() => {
    if (!user) return undefined;
    let tries = 0;
    let timer;
    const load = () => fetchMyBilling()
      .then((data) => {
        setMe(data);
        if (status === "success" && data.plan !== "plus" && tries++ < 10) timer = setTimeout(load, 2000);
      })
      .catch(() => {});
    load();
    return () => clearTimeout(timer);
  }, [user, status]);

  const prices = plans?.prices;
  const offer = !offerOver ? plans?.offer : null;
  const isPlus = me?.plan === "plus";
  const monthly = prices?.plus_monthly;
  const yearly = prices?.plus_yearly;
  const savePercent = monthly && yearly ? Math.round((1 - yearly.amount / (monthly.amount * 12)) * 100) : 0;
  const shown = cycle === "yearly" ? yearly : monthly;
  const discounted = useMemo(() => (shown && offer
    ? { ...shown, amount: Math.round(shown.amount * (1 - offer.percentOff / 100)) }
    : null), [shown, offer]);
  const offerDate = offer
    ? new Intl.DateTimeFormat(lang === "en" ? "en-CH" : "fr-CH", { day: "numeric", month: "long" }).format(new Date(offer.endsAt))
    : "";

  const subscribe = async () => {
    setError("");
    setBusy(true);
    try {
      if (isPlus) await openPortal();
      else await startCheckout(cycle === "yearly" ? "plus_yearly" : "plus_monthly");
    } catch {
      setError(t("billing.error"));
      setBusy(false);
    }
  };

  const freeFeatures = t("billing.freeFeatures", { returnObjects: true });
  const plusFeatures = t("billing.plusFeatures", {
    returnObjects: true,
    count: plans?.boostsPerMonth ?? 2,
    hours: plans?.boostHours ?? 48,
  });
  const faq = t("billing.faq", { returnObjects: true });

  let cta;
  if (!user) {
    cta = <Link to="/login" className={classes.ctaPrimary}>{t("billing.loginToSubscribe")}</Link>;
  } else if (isPlus) {
    cta = <button type="button" className={classes.ctaSecondary} onClick={subscribe} disabled={busy}>{t("billing.manage")}</button>;
  } else if (plans && !plans.enabled) {
    cta = (
      <>
        <button type="button" className={classes.ctaPrimary} disabled>{t("billing.comingSoon")}</button>
        <p className={classes.ctaNote}>{t("billing.comingSoonNote")}</p>
      </>
    );
  } else {
    cta = <button type="button" className={classes.ctaPrimary} onClick={subscribe} disabled={busy || !plans}>{t("billing.choosePlus")}</button>;
  }

  return (
    <div className={classes.page}>
      <header className={classes.intro}>
        <h1 className={classes.title}>{t("billing.pageTitle")}</h1>
        <p className={classes.lead}>{t("billing.pageLead")}</p>
      </header>

      {status === "success" && (
        <div className={classes.notice} role="status">
          <Check size={18} aria-hidden="true" />
          <div>
            <strong>{t("billing.successTitle")}</strong>
            <p>{isPlus ? t("billing.successDone") : t("billing.successPending")}</p>
          </div>
        </div>
      )}
      {status === "cancel" && (
        <div className={`${classes.notice} ${classes.noticeMuted}`} role="status">
          <p>{t("billing.cancelNote")}</p>
        </div>
      )}

      {offer && (
        <section className={classes.offer} aria-labelledby="offer-title">
          <div className={classes.offerText}>
            <h2 id="offer-title" className={classes.offerTitle}>{t("billing.offerTitle", { percent: offer.percentOff })}</h2>
            <p>{t("billing.offerText", { date: offerDate })}</p>
          </div>
          <div className={classes.offerTimer}>
            <span className={classes.offerLabel}><Clock size={14} aria-hidden="true" /> {t("billing.offerEndsIn")}</span>
            <Countdown endsAt={offer.endsAt} onEnd={() => setOfferOver(true)} />
          </div>
        </section>
      )}

      <div className={classes.cycle} role="radiogroup" aria-label={t("billing.plus")}>
        {["monthly", "yearly"].map((key) => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={cycle === key}
            className={`${classes.cycleBtn} ${cycle === key ? classes.cycleOn : ""}`}
            onClick={() => setCycle(key)}
          >
            {t(`billing.${key}`)}
            {key === "yearly" && savePercent > 0 && <span className={classes.save}>{t("billing.yearlySave", { percent: savePercent })}</span>}
          </button>
        ))}
      </div>

      <div className={classes.plans}>
        <article className={classes.plan} aria-labelledby="plan-free">
          <h2 id="plan-free" className={classes.planName}>{t("billing.free")}</h2>
          <p className={classes.price}><span className={classes.amount}>{t("billing.freePrice")}</span></p>
          <p className={classes.tagline}>{t("billing.freeTagline")}</p>
          <ul className={classes.features}>
            {freeFeatures.map((f) => (
              <li key={f}><Check size={16} aria-hidden="true" className={classes.check} />{f}</li>
            ))}
          </ul>
          {user && !isPlus && <p className={classes.current}>{t("billing.currentPlan")}</p>}
        </article>

        <article className={`${classes.plan} ${classes.planPlus}`} aria-labelledby="plan-plus">
          <h2 id="plan-plus" className={classes.planName}><HiveMark />{t("billing.plus")}</h2>
          <p className={classes.price}>
            {discounted ? (
              <>
                <span className={classes.amount}>{formatPrice(discounted, lang)}</span>
                <span className={classes.period}>{cycle === "yearly" ? t("billing.perYear") : t("billing.perMonth")}</span>
                <s className={classes.was}>{formatPrice(shown, lang)}</s>
              </>
            ) : (
              <>
                <span className={classes.amount}>{shown ? formatPrice(shown, lang) : "—"}</span>
                <span className={classes.period}>{cycle === "yearly" ? t("billing.perYear") : t("billing.perMonth")}</span>
              </>
            )}
          </p>
          <p className={classes.priceNote}>
            {cycle === "yearly" && yearly
              ? t("billing.billedYearly", { price: formatPrice({ ...yearly, amount: Math.round((discounted || yearly).amount / 12) }, lang) })
              : " "}
          </p>
          <p className={classes.tagline}>{t("billing.plusTagline")}</p>
          <p className={classes.featuresIntro}>{t("billing.plusIntro")}</p>
          <ul className={classes.features}>
            {plusFeatures.map((f) => (
              <li key={f}><Check size={16} aria-hidden="true" className={classes.check} />{f}</li>
            ))}
          </ul>
          <div className={classes.cta}>
            {cta}
            {error && <p className={classes.error} role="alert"><CircleAlert size={16} aria-hidden="true" />{error}</p>}
          </div>
          {isPlus && <p className={classes.current}>{t("billing.currentPlan")}</p>}
        </article>
      </div>

      <section className={classes.boost} aria-labelledby="boost-title">
        <Rocket size={22} aria-hidden="true" className={classes.boostIcon} />
        <div>
          <h2 id="boost-title" className={classes.boostTitle}>
            {t("billing.boostTitle")}
            {prices?.boost && (
              <span className={classes.boostPrice}>{t("billing.boostPrice", { price: formatPrice(prices.boost, lang), hours: plans?.boostHours ?? 48 })}</span>
            )}
          </h2>
          <p>{t("billing.boostText", { hours: plans?.boostHours ?? 48 })}</p>
        </div>
      </section>

      <section className={classes.faq} aria-labelledby="faq-title">
        <h2 id="faq-title" className={classes.faqTitle}>{t("billing.faqTitle")}</h2>
        {faq.map((item) => (
          <details key={item.q} className={classes.faqItem}>
            <summary>{item.q}</summary>
            <p>{item.a}</p>
          </details>
        ))}
      </section>
    </div>
  );
}
