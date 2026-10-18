import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import classes from "./ThankYouCelebration.module.css";

/* Remerciement après un paiement (abonnement Hive+ ou boost).
   - pending : paiement reçu, en attente de la confirmation du serveur (webhook Stripe) → anneau qui tourne
   - confirmé : l'anneau se dessine, la coche apparaît, un bref éclat de particules bleues et dorées
   variant « plus » (bleu Hive) ou « boost » (doré). Fermeture : bouton, Échap ou clic à côté.
   Mouvement réduit : tout s'affiche sans animation. */
const PARTICLES = 16;

export default function ThankYouCelebration({ open, pending = false, variant = "plus", label, title, message, primary, onClose }) {
  const { t } = useTranslation();
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  useEffect(() => {
    // Focus sur la fenêtre (lecteurs d'écran, Tab) sans contour imposé sur un bouton à l'ouverture
    if (open) dialogRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className={classes.backdrop} onClick={onClose}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="thanks-title"
        aria-describedby="thanks-text"
        aria-busy={pending || undefined}
        className={`${classes.card} ${variant === "boost" ? classes.boost : classes.plus}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={classes.markWrap} aria-hidden="true">
          {!pending && (
            <div className={classes.burst}>
              {Array.from({ length: PARTICLES }, (_, i) => (
                <span
                  key={i}
                  className={i % 2 ? classes.particleGold : classes.particleAccent}
                  style={{ "--angle": `${(360 / PARTICLES) * i + (i % 3) * 7}deg`, "--dist": `${62 + (i % 4) * 10}px` }}
                />
              ))}
            </div>
          )}
          <svg className={classes.mark} viewBox="0 0 64 64">
            <circle className={classes.track} cx="32" cy="32" r="28" />
            <circle className={pending ? classes.ringPending : classes.ring} cx="32" cy="32" r="28" />
            {!pending && <path className={classes.check} d="M21 33.5l7.5 7.5L44 25" />}
          </svg>
        </div>

        {label && <span className={classes.label}>{label}</span>}
        <h2 id="thanks-title" className={classes.title}>{title}</h2>
        <p id="thanks-text" className={classes.message}>{message}</p>

        <div className={classes.actions}>
          {!pending && primary && (
            <Link to={primary.to} className={classes.primary} onClick={onClose}>
              {primary.label}
            </Link>
          )}
          <button type="button" className={classes.secondary} onClick={onClose}>
            {t("billing.thanksClose")}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
