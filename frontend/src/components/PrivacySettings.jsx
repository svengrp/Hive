/* Mes données (LPD / RGPD) : télécharger ses données, supprimer son compte.
   La confirmation accepte le mot de passe, ou l'email pour un compte créé via Google/GitHub. */
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Download, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import classes from "./PrivacySettings.module.css";

export default function PrivacySettings() {
  const { t } = useTranslation();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [exporting, setExporting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [secret, setSecret] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  const downloadData = async () => {
    setExporting(true);
    setError("");
    try {
      const data = await api("/user/me/export");
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "hive-mes-donnees.json";
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    } finally {
      setExporting(false);
    }
  };

  const deleteAccount = async (event) => {
    event.preventDefault();
    setDeleting(true);
    setError("");
    try {
      await api("/user/me", { method: "DELETE", body: JSON.stringify({ password: secret, email: secret }) });
      logout();
      navigate("/", { replace: true });
    } catch (err) {
      setError(err.message);
      setDeleting(false);
    }
  };

  return (
    <div className={classes.panel}>
      <p className={classes.lead}>
        {t("privacy.lead")}{" "}
        <Link to="/confidentialite" className={classes.link}>{t("privacy.policyLink")}</Link>
      </p>

      <div className={classes.actions}>
        <button type="button" className={classes.secondaryBtn} onClick={downloadData} disabled={exporting}>
          <Download size={16} aria-hidden="true" />
          {exporting ? t("privacy.exporting") : t("privacy.export")}
        </button>
        {!confirmOpen && (
          <button type="button" className={classes.dangerBtn} onClick={() => setConfirmOpen(true)}>
            <Trash2 size={16} aria-hidden="true" />
            {t("privacy.delete")}
          </button>
        )}
      </div>

      {confirmOpen && (
        <form className={classes.confirm} onSubmit={deleteAccount}>
          <h3 className={classes.confirmTitle}>{t("privacy.confirmTitle")}</h3>
          <ul className={classes.consequences}>
            <li>{t("privacy.consequenceProjects")}</li>
            <li>{t("privacy.consequenceMessages")}</li>
            <li>{t("privacy.consequenceSubscription")}</li>
            <li>{t("privacy.consequenceFinal")}</li>
          </ul>
          <label className={classes.label} htmlFor="delete-confirm">{t("privacy.confirmLabel")}</label>
          <input
            id="delete-confirm"
            className={classes.input}
            type="password"
            autoComplete="current-password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            required
          />
          <div className={classes.actions}>
            <button type="button" className={classes.secondaryBtn} onClick={() => { setConfirmOpen(false); setSecret(""); setError(""); }}>
              {t("privacy.cancel")}
            </button>
            <button type="submit" className={classes.dangerBtnSolid} disabled={deleting || !secret}>
              {deleting ? t("privacy.deleting") : t("privacy.confirmDelete")}
            </button>
          </div>
        </form>
      )}

      {error && <p className={classes.error} role="alert">{error}</p>}
    </div>
  );
}
