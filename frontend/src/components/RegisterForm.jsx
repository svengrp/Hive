import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff, MailCheck } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import classes from "./RegisterForm.module.css";
import { useTranslation } from "react-i18next";
import PasswordStrengthMeter, { computeEntropy } from "./PasswordValidator";
import FloatingField from "./FloatingField";
import SocialLogin from "./SocialLogin";

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[A-Za-z]{2,}$/;
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@.#$!%*?&])[A-Za-z\d@.#$!%*?&]{8,15}$/;

export default function RegisterForm() {
  const [step, setStep] = useState("register");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState(["", "", "", "", "", ""]);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendingCode, setResendingCode] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);

  const navigate = useNavigate();
  const { register, verifyEmail, resendVerificationEmail, login } = useAuth();
  const { t } = useTranslation();

  const normalizedEmail = useMemo(() => email.trim().toLowerCase(), [email]);

  const handleCodeChange = (value, index) => {
    if (!/^\d?$/.test(value)) return;
    const newCode = [...verificationCode];
    newCode[index] = value;
    setVerificationCode(newCode);
    if (value && index < 5) {
      document.getElementById(`reg-otp-${index + 1}`)?.focus();
    }
  };

  const handleCodeKeyDown = (e, index) => {
    if (e.key === "Backspace" && !verificationCode[index] && index > 0) {
      document.getElementById(`reg-otp-${index - 1}`)?.focus();
    }
  };
  const passwordMismatch = confirmPassword.length > 0 && password !== confirmPassword;

  const handleRegister = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!normalizedEmail || !password.trim() || !confirmPassword.trim()) {
      setError(t("register.allFieldsRequired"));
      return;
    }

    if (!EMAIL_REGEX.test(normalizedEmail)) {
      setError(t("register.invalidEmail"));
      return;
    }

    if (!PASSWORD_REGEX.test(password)) {
      setError(t("register.weakPassword"));
      return;
    }

    if (passwordMismatch) {
      setError(t("register.passwordMismatch"));
      return;
    }

    if (!acceptTerms) {
      setError(t("legal.consentRequired"));
      return;
    }

    setLoading(true);
    try {
      const response = await register({ email: normalizedEmail, password, acceptTerms });
      setSuccess(response?.message || t("register.verifySuccess"));
      setStep("verify");
    } catch (err) {
      setError(err.message || t("register.registrationError"));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyEmail = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    const otpCode = verificationCode.join("");
    if (otpCode.length !== 6) {
      setError(t("register.verifyCodeRequired"));
      return;
    }

    setLoading(true);
    try {
      await verifyEmail(normalizedEmail, otpCode);
      setSuccess(t("register.verifySuccess"));
      await login({ email: normalizedEmail, password });
      navigate("/profile");
    } catch (err) {
      setError(err.message || t("register.verifyError"));
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    setError("");
    setSuccess("");
    setResendingCode(true);
    try {
      const response = await resendVerificationEmail(normalizedEmail);
      setSuccess(response?.message || t("register.resendBtn"));
    } catch (err) {
      setError(err.message || t("register.resendError"));
    } finally {
      setResendingCode(false);
    }
  };

  return (
    <div className={classes.registerWrapper}>
      <div className={classes.registerCard}>
        <h1 className={classes.title}>
          {step === "register" ? t("register.titleRegister") : t("register.titleVerify")}
        </h1>

        {step === "register" && <SocialLogin />}

        {step === "register" ? (
          <form className={classes.form} onSubmit={handleRegister} noValidate>
            <FloatingField
              id="register-email"
              name="email"
              type="email"
              label={t("register.emailLabel")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />

            <FloatingField
              id="register-password"
              name="password"
              type={showPassword ? "text" : "password"}
              label={t("register.passwordLabel")}
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(""); }}
              autoComplete="new-password"
            >
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? t("register.hidePassword") : t("register.showPassword")}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </FloatingField>

            <PasswordStrengthMeter password={password}/>
            <FloatingField
              id="register-confirm-password"
              name="confirmPassword"
              type={showConfirmPassword ? "text" : "password"}
              label={t("register.confirmPasswordLabel")}
              value={confirmPassword}
              onChange={(e) => { setConfirmPassword(e.target.value); setError(""); }}
              autoComplete="new-password"
              error={passwordMismatch}
            >
              <button
                type="button"
                onClick={() => setShowConfirmPassword((prev) => !prev)}
                aria-label={showConfirmPassword ? t("register.hidePassword") : t("register.showPassword")}
              >
                {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </FloatingField>

            {passwordMismatch && (
              <p className={classes.hint}>{t("register.passwordMismatch")}</p>
            )}

            {/* Consentement explicite (LPD / RGPD) : conditions, confidentialité, âge minimum */}
            <label className={classes.consent}>
              <input
                type="checkbox"
                checked={acceptTerms}
                onChange={(e) => { setAcceptTerms(e.target.checked); setError(""); }}
                required
              />
              <span>
                {t("legal.consentBefore")}{" "}
                <Link to="/conditions" target="_blank" rel="noopener">{t("legal.termsTitle")}</Link>{" "}
                {t("legal.consentAnd")}{" "}
                <Link to="/confidentialite" target="_blank" rel="noopener">{t("legal.privacyTitle")}</Link>
                {t("legal.consentAfter")}
              </span>
            </label>

            {error && <p className={classes.error} role="alert">{error}</p>}
            {success && <p className={classes.success} role="status">{success}</p>}

            <button type="submit" className={classes.registerBtn} disabled={loading || computeEntropy(password) < 36 || passwordMismatch || !acceptTerms}>
              {loading ? t("register.loadingCreate") : t("register.submitCreate")}
            </button>
          </form>
        ) : (
          <form className={classes.form} onSubmit={handleVerifyEmail} noValidate>
            <div className={classes.verifyIntro}>
              <MailCheck size={20} />
              <p>
                {t("register.verifyIntro")} <strong>{normalizedEmail}</strong>.
              </p>
            </div>

            <div className={classes.otpWrapper}>
              {verificationCode.map((digit, index) => (
                <input
                  key={index}
                  id={`reg-otp-${index}`}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength="1"
                  className={classes.otpInput}
                  value={digit}
                  onChange={(e) => handleCodeChange(e.target.value, index)}
                  onKeyDown={(e) => handleCodeKeyDown(e, index)}
                />
              ))}
            </div>

            {error && <p className={classes.error} role="alert">{error}</p>}
            {success && <p className={classes.success} role="status">{success}</p>}

            <button type="submit" className={classes.registerBtn} disabled={loading}>
              {loading
                ? (success ? t("register.loadingLogin") : t("register.loadingVerify"))
                : t("register.submitVerify")}
            </button>

            <button
              type="button"
              className={classes.secondaryBtn}
              onClick={handleResendCode}
              disabled={resendingCode}
            >
              {resendingCode ? t("register.resendLoading") : t("register.resendBtn")}
            </button>
          </form>
        )}

        <p className={classes.registerText}>
          {t("register.alreadyRegistered")}{" "}
          <Link to="/login" className={classes.link}>{t("register.signIn")}</Link>
        </p>
      </div>
    </div>
  );
}
