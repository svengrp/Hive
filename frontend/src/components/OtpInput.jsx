import { useRef } from "react";
import { useTranslation } from "react-i18next";
import classes from "./OtpInput.module.css";

/* Saisie d'un code à 6 chiffres en cases séparées.
   - Coller le code (depuis l'email) remplit toutes les cases.
   - Remplissage automatique iOS / Android (« Depuis Mail ») : autocomplete="one-time-code"
     sur la première case, qui reçoit alors les 6 chiffres d'un coup.
   value : chaîne de 0 à 6 chiffres ; onChange(code) reçoit la nouvelle chaîne. */
const LENGTH = 6;

export default function OtpInput({ value = "", onChange, autoFocus = false, disabled = false, idPrefix = "otp" }) {
  const { t } = useTranslation();
  const refs = useRef([]);
  const digits = Array.from({ length: LENGTH }, (_, i) => value[i] || "");

  const focus = (index) => refs.current[Math.max(0, Math.min(LENGTH - 1, index))]?.focus();

  // Écrit une suite de chiffres à partir d'une case (frappe, collage ou remplissage automatique)
  const fill = (index, text) => {
    const next = [...digits];
    for (let i = 0; i < text.length && index + i < LENGTH; i += 1) next[index + i] = text[i];
    onChange(next.join("").slice(0, LENGTH));
    focus(index + text.length);
  };

  const handleChange = (index, raw) => {
    const clean = raw.replace(/\D/g, "");
    if (!clean) {
      const next = [...digits];
      next[index] = "";
      onChange(next.join(""));
      return;
    }
    if (clean.length >= LENGTH) fill(0, clean.slice(0, LENGTH));
    else fill(index, clean.slice(-1));
  };

  const handleKeyDown = (index, e) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      e.preventDefault();
      const next = [...digits];
      next[index - 1] = "";
      onChange(next.join(""));
      focus(index - 1);
    } else if (e.key === "ArrowLeft") {
      focus(index - 1);
    } else if (e.key === "ArrowRight") {
      focus(index + 1);
    }
  };

  const handlePaste = (index, e) => {
    const clean = (e.clipboardData?.getData("text") || "").replace(/\D/g, "");
    if (!clean) return;
    e.preventDefault();
    if (clean.length >= LENGTH) fill(0, clean.slice(0, LENGTH));
    else fill(index, clean);
  };

  return (
    <div className={classes.wrapper} role="group" aria-label={t("otp.label")}>
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(el) => { refs.current[index] = el; }}
          id={`${idPrefix}-${index}`}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          maxLength={index === 0 ? LENGTH : 1}
          aria-label={t("otp.digit", { n: index + 1 })}
          className={classes.input}
          value={digit}
          disabled={disabled}
          autoFocus={autoFocus && index === 0}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={(e) => handlePaste(index, e)}
          onFocus={(e) => e.target.select()}
        />
      ))}
    </div>
  );
}
