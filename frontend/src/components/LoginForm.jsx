import { useState } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import classes from "./LoginForm.module.css";
import { useTranslation } from "react-i18next";
import { Eye, EyeOff, MailCheck } from "lucide-react";
import FloatingField from "./FloatingField";
import SocialLogin from "./SocialLogin";
import OtpInput from "./OtpInput";

const OAUTH_ERRORS = ["cancelled", "expired", "email", "unavailable", "server"];

export default function LoginForm() {
  const [email, setEmail]         = useState(() => localStorage.getItem("hive-last-email") || "");
  const [password, setPassword]   = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading]     = useState(false);
  // Compte dont l'adresse n'a jamais été confirmée : saisie du code reçu, puis connexion
  const [verifying, setVerifying] = useState(false);
  const [code, setCode]           = useState("");
  const [info, setInfo]           = useState("");

  const { login, verifyEmail, resendVerificationEmail }  = useAuth();
  const navigate   = useNavigate();
  const { t }      = useTranslation();
  // Erreur renvoyée par le retour Google/GitHub (?oauthError=…)
  const [searchParams] = useSearchParams();
  const oauthError = searchParams.get("oauthError");
  const [error, setError] = useState(() =>
    oauthError ? t(`social.errors.${OAUTH_ERRORS.includes(oauthError) ? oauthError : "server"}`) : ""
  );

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!email.trim() || !password.trim()) {
      setError(t("login.allFieldsRequired"));
      return;
    }
    setLoading(true);
    try {
      await login({ email, password, rememberMe });
      localStorage.setItem("hive-last-email", email.trim().toLowerCase());
      navigate("/profile");
    } catch (err) {
      if (err.code === "email_not_verified") {
        setVerifying(true);
        setCode("");
        resendVerificationEmail(email.trim().toLowerCase()).catch(() => {});
      } else {
        setError(err.message || t("login.invalidCredentials"));
      }
    } finally {
      setLoading(false);
    }
  };

  const onVerify = async (e) => {
    e.preventDefault();
    setError("");
    setInfo("");
    if (code.length !== 6) {
      setError(t("register.verifyCodeRequired"));
      return;
    }
    setLoading(true);
    try {
      await verifyEmail(email.trim().toLowerCase(), code);
      await login({ email, password, rememberMe });
      localStorage.setItem("hive-last-email", email.trim().toLowerCase());
      navigate("/profile");
    } catch (err) {
      setError(err.message || t("register.verifyError"));
    } finally {
      setLoading(false);
    }
  };

  const onResend = async () => {
    setError("");
    try {
      const res = await resendVerificationEmail(email.trim().toLowerCase());
      setInfo(res?.message || t("register.resendBtn"));
    } catch (err) {
      setError(err.message || t("register.resendError"));
    }
  };

  if (verifying) {
    return (
      <div className={classes.loginWrapper}>
        <div className={classes.loginCard}>
          <h2>{t("login.verifyTitle")}</h2>
          <form onSubmit={onVerify} noValidate className={classes.form}>
            <div className={classes.verifyIntro}>
              <MailCheck size={20} aria-hidden="true" />
              <p>{t("login.verifyIntro")} <strong>{email.trim().toLowerCase()}</strong>.</p>
            </div>
            <OtpInput value={code} onChange={setCode} autoFocus idPrefix="login-otp" />
            {error && <p className={classes.error} role="alert">{error}</p>}
            {info && <p className={classes.info} role="status">{info}</p>}
            <button type="submit" className={classes.loginBtn} disabled={loading}>
              {loading ? t("login.verifyLoading") : t("login.verifySubmit")}
            </button>
            <button type="button" className={classes.secondaryBtn} onClick={onResend}>
              {t("register.resendBtn")}
            </button>
          </form>
          <p className={classes.registerText}>
            <button type="button" className={classes.linkBtn} onClick={() => { setVerifying(false); setError(""); setInfo(""); }}>
              {t("login.verifyBack")}
            </button>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={classes.loginWrapper}>
      <div className={classes.loginCard}>
        <h2>{t("login.title")}</h2>

        <SocialLogin rememberMe={rememberMe} />

        <form onSubmit={onSubmit} noValidate className={classes.form}>

          <FloatingField
            id="email"
            name="email"
            type="email"
            label={t("login.emailPlaceholder")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />

          <FloatingField
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            label={t("login.passwordPlaceholder")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          >
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? t("register.hidePassword") : t("register.showPassword")}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </FloatingField>

          {error && (
            <p className={classes.error} role="alert">{error}</p>
          )}

          <div className={classes.rememberRow}>
            <label className={classes.rememberLabel}>
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              {t("login.rememberMe")}
            </label>
            <Link to="/forgotpassword" className={classes.forgotPassword}>
              {t("login.forgotPassword")}
            </Link>
          </div>

          <button type="submit" className={classes.loginBtn} disabled={loading}>
            {loading ? t("login.loading") : t("login.submit")}
          </button>
        </form>

        <p className={classes.registerText}>
          {t("login.noAccount")}{" "}
          <Link to="/register">{t("login.createAccount")}</Link>
        </p>
      </div>
    </div>
  );
}
