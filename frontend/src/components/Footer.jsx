/* Pied de page : liens légaux accessibles depuis toutes les pages (LPD / RGPD / LCD).
   Masqué sur la messagerie, qui occupe toute la hauteur de l'écran. */
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import classes from "./Footer.module.css";

const HIDDEN_ON = ["/messages"];

export default function Footer() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  if (HIDDEN_ON.some((path) => pathname.startsWith(path))) return null;

  return (
    <footer className={classes.footer}>
      <nav className={classes.links} aria-label={t("legal.related")}>
        <Link to="/confidentialite">{t("legal.privacyTitle")}</Link>
        <Link to="/conditions">{t("legal.termsTitle")}</Link>
        <Link to="/mentions-legales">{t("legal.imprintTitle")}</Link>
        <a href="mailto:contact@hive-app.ch">{t("legal.contact")}</a>
      </nav>
      <p className={classes.copy}>© {new Date().getFullYear()} Hive · Genève</p>
    </footer>
  );
}
