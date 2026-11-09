import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Download, X } from "lucide-react";
import { downloadAttachment } from "../../lib/attachments";
import classes from "./ImageLightbox.module.css";

/* Aperçu plein écran d'une image jointe, dans Hive (avant : nouvel onglet sans retour possible dans l'app).
   Se ferme avec la croix, Échap, un clic à côté de l'image ou le retour du navigateur / du téléphone. */
export default function ImageLightbox({ att, url, onClose }) {
  const { t } = useTranslation();
  const closeRef = useRef(null);
  const closedByHistory = useRef(false);

  useEffect(() => {
    // Une entrée d'historique : le geste « retour » ferme l'aperçu au lieu de quitter la messagerie
    window.history.pushState({ hiveLightbox: true }, "");
    const onPop = () => { closedByHistory.current = true; onClose(); };
    const onKey = (e) => { if (e.key === "Escape") close(); };
    window.addEventListener("popstate", onPop);
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
    // close et onClose sont stables pendant la vie de l'aperçu
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function close() {
    if (!closedByHistory.current && window.history.state?.hiveLightbox) window.history.back();
    else onClose();
  }

  return createPortal(
    <div className={classes.backdrop} role="dialog" aria-modal="true" aria-label={att.name} onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className={classes.bar}>
        <span className={classes.name}>{att.name}</span>
        <button type="button" className={classes.btn} onClick={() => downloadAttachment(att).catch(() => {})} aria-label={t("messages.download", { name: att.name })}>
          <Download size={18} aria-hidden="true" />
        </button>
        <button ref={closeRef} type="button" className={classes.btn} onClick={close} aria-label={t("messages.closeImage")}>
          <X size={20} aria-hidden="true" />
        </button>
      </div>
      <img src={url} alt={att.name} className={classes.image} onClick={(e) => e.stopPropagation()} />
    </div>,
    document.body,
  );
}
