import { Star } from "lucide-react";
import { useTranslation } from "react-i18next";
import classes from "./PlusBadge.module.css";

/* Badge « Hive+ » des membres abonnés (profil, profil public, cartes et page projet). */
export default function PlusBadge({ size = "sm", className = "" }) {
  const { t } = useTranslation();
  return (
    <span className={`${classes.badge} ${size === "md" ? classes.md : ""} ${className}`.trim()} title={t("billing.plusBadgeTitle")}>
      <Star size={size === "md" ? 12 : 10} strokeWidth={2.4} aria-hidden="true" />
      {t("billing.plusBadge")}
    </span>
  );
}
