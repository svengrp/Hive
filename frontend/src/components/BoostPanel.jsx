import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Lock, Rocket } from "lucide-react";
import { api } from "../lib/api";
import { fetchMyBilling, fetchPlans, formatPrice, isBoosted, startCheckout } from "../lib/billing";
import classes from "./BoostPanel.module.css";

/* Page projet (propriétaire) : mise en avant du projet et statistiques Hive+ */
export default function BoostPanel({ project, onBoosted }) {
  const { t, i18n } = useTranslation();
  const [searchParams] = useSearchParams();
  const [billing, setBilling] = useState(null);
  const [plans, setPlans] = useState(null);
  const [stats, setStats] = useState(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null); // { type: "ok" | "error", text }
  const projectId = project._id;
  const lang = i18n.language;

  useEffect(() => {
    fetchMyBilling().then(setBilling).catch(() => setBilling({ plan: "free", boostCredits: 0 }));
    fetchPlans().then(setPlans).catch(() => setPlans({ enabled: false }));
    api(`/projects/${projectId}/stats`).then(setStats).catch(() => setStats(null));
  }, [projectId]);

  // Retour de Stripe après un boost payé : on attend que le webhook l'active
  useEffect(() => {
    if (searchParams.get("boost") !== "success") return undefined;
    setFeedback({ type: "ok", text: t("billing.boostPending") });
    let tries = 0;
    let timer;
    const poll = () => api(`/projects/${projectId}`).then((p) => {
      if (isBoosted(p)) {
        onBoosted(p.boostedUntil);
        setFeedback({ type: "ok", text: t("billing.boostSuccess") });
      } else if (tries++ < 10) {
        timer = setTimeout(poll, 2000);
      }
    }).catch(() => {});
    poll();
    return () => clearTimeout(timer);
  }, [searchParams, projectId, onBoosted, t]);

  const boosted = isBoosted(project);
  const until = boosted
    ? new Intl.DateTimeFormat(lang === "en" ? "en-CH" : "fr-CH", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(project.boostedUntil))
    : null;
  const credits = billing?.plan === "plus" ? billing.boostCredits || 0 : 0;
  const hours = plans?.boostHours ?? 48;
  const canBoost = project.status === "open";

  const useCredit = async () => {
    setBusy(true);
    setFeedback(null);
    try {
      const data = await api(`/billing/boost/${projectId}`, { method: "POST" });
      onBoosted(data.boostedUntil);
      setBilling((b) => ({ ...b, boostCredits: data.boostCredits }));
      setFeedback({ type: "ok", text: t("billing.boostSuccess") });
    } catch {
      setFeedback({ type: "error", text: t("billing.error") });
    } finally {
      setBusy(false);
    }
  };

  const buy = async () => {
    setBusy(true);
    setFeedback(null);
    try {
      await startCheckout("boost", projectId);
    } catch {
      setFeedback({ type: "error", text: t("billing.error") });
      setBusy(false);
    }
  };

  let action = null;
  if (canBoost && billing && plans) {
    if (credits > 0) {
      action = (
        <button type="button" className={classes.primary} onClick={useCredit} disabled={busy}>
          <Rocket size={16} aria-hidden="true" /> {t("billing.useCredit", { count: credits })}
        </button>
      );
    } else if (plans.enabled && plans.prices?.boost) {
      action = (
        <button type="button" className={classes.primary} onClick={buy} disabled={busy}>
          <Rocket size={16} aria-hidden="true" /> {t("billing.buyBoost", { price: formatPrice(plans.prices.boost, lang) })}
        </button>
      );
    } else {
      action = <button type="button" className={classes.primary} disabled>{t("billing.comingSoon")}</button>;
    }
  }

  return (
    <section className={classes.card} aria-labelledby="boost-card-title">
      <h2 id="boost-card-title" className={classes.title}>{t("billing.boostCardTitle")}</h2>
      {boosted ? (
        <p className={classes.status}>
          <span className={classes.live} aria-hidden="true" />
          {t("billing.boostActiveUntil", { date: until })}
        </p>
      ) : (
        <p className={classes.text}>{canBoost ? t("billing.boostIdle", { hours }) : t("billing.boostClosed")}</p>
      )}
      {action}
      {feedback && (
        <p className={feedback.type === "ok" ? classes.ok : classes.error} role={feedback.type === "ok" ? "status" : "alert"}>{feedback.text}</p>
      )}

      <div className={classes.statsBlock}>
        <h3 className={classes.statsTitle}>{t("billing.statsTitle")}</h3>
        {stats && !stats.locked ? (
          <>
            <dl className={classes.stats}>
              <div><dt>{t("billing.statsViews")}</dt><dd>{stats.views30}</dd></div>
              <div><dt>{t("billing.statsViewers")}</dt><dd>{stats.uniqueViewers30}</dd></div>
              <div><dt>{t("billing.statsRequests")}</dt><dd>{stats.requests30}</dd></div>
            </dl>
            <p className={classes.note}>{t("billing.statsViews7", { count: stats.views7 })}</p>
          </>
        ) : (
          <p className={classes.locked}>
            <Lock size={14} aria-hidden="true" />
            <span>{t("billing.statsLocked")} <Link to="/abonnement">{t("billing.discoverPlus")}</Link></span>
          </p>
        )}
      </div>
    </section>
  );
}
