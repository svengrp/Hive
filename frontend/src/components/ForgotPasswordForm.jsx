import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import classes from "./ForgotPasswordForm.module.css";
import { useTranslation } from "react-i18next";
import FloatingField from "./FloatingField";
import OtpInput from "./OtpInput";

/* Formulaire en 2 étapes : saisie de l'email (step 1) → saisie du code OTP reçu par email (step 2).
   Le code vérifié, l'utilisateur est redirigé vers /reset-password avec email+code dans le state. */
export default function ForgotPasswordForm() {
  const { t } = useTranslation();

  const navigate = useNavigate();
  const { resetPassword, verifyResetCode } = useAuth();

  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState(1); // 1=email | 2=code
  const [msg, setMsg] = useState({ type: "", text: "" });
  const [loading, setLoading] = useState(false);

  const sendCode = async () => {
    await resetPassword(email.trim().toLowerCase());
    setStep(2);
    setCode("");
    setMsg({ type: "success", text: t("forgot.codeSent") });
  };

  // STEP 1 — envoyer email
  const submitEmail = async (e) => {
    e.preventDefault();
    setMsg({ type: "", text: "" });
    if (!email.trim()) return;
    setLoading(true);
    try {
      await sendCode();
    } catch (err) {
      // Message du serveur (ex. trop de demandes) ; panne réseau : message générique traduit
      setMsg({ type: "error", text: err.status ? err.message : t("forgot.sendError") });
    } finally {
      setLoading(false);
    }
  };

  // STEP 2 — vérifier code
  const submitCode = async (e) => {
    e.preventDefault();
    setMsg({ type: "", text: "" });

    if (code.length !== 6) {
      setMsg({ type: "error", text: t("forgot.codeIncomplete") });
      return;
    }

    setLoading(true);
    try {
      await verifyResetCode(email.trim().toLowerCase(), code);
      navigate("/reset-password", {
        state: { email: email.trim().toLowerCase(), code },
      });
    } catch (err) {
      // « Trop d'essais » (429) : le message du serveur invite à demander un nouveau code
      setMsg({ type: "error", text: err.status === 429 ? err.message : t("forgot.codeInvalid") });
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    setMsg({ type: "", text: "" });
    try {
      await sendCode();
    } catch (err) {
      setMsg({ type: "error", text: err.status ? err.message : t("forgot.sendError") });
    }
  };

  return (
    <div className={classes.loginWrapper}>
      <div className={classes.loginCard}>
        <h2>{t("forgot.title")}</h2>

        {/* STEP 1 */}
        {step === 1 && (
          <form onSubmit={submitEmail} className={classes.form}>
            <FloatingField
              id="forgot-email"
              name="email"
              type="email"
              label={t("forgot.emailPlaceholder")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />

            <button type="submit" className={classes.loginBtn} disabled={loading}>
              {t("forgot.sendBtn")}
            </button>
          </form>
        )}

        {/* STEP 2 */}
        {step === 2 && (
          <form onSubmit={submitCode} className={classes.form}>
            <p className={classes.resetInfo}>
              {t("forgot.codeInstruction")} <strong>{email.trim().toLowerCase()}</strong>
            </p>

            <OtpInput value={code} onChange={setCode} autoFocus idPrefix="otp" />

            <button type="submit" className={classes.loginBtn} disabled={loading}>
              {t("forgot.verifyBtn")}
            </button>
            <button type="button" className={classes.secondaryBtn} onClick={resend}>
              {t("register.resendBtn")}
            </button>
          </form>
        )}

        {msg.text && (
          <p className={msg.type === "success" ? classes.success : classes.error} role={msg.type === "success" ? "status" : "alert"}>
            {msg.text}
          </p>
        )}

        <p className={classes.registerText}>
          <Link to="/login" className={classes.link}>
            {t("forgot.backToLogin")}
          </Link>
        </p>
      </div>
    </div>
  );
}
