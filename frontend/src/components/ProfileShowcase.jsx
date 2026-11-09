import { useRef, useState } from "react";
import { FileText, ImagePlus, LoaderCircle, Trash2, Upload, ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { api, BASE_URL } from "../lib/api";
import { BANNER_ACCEPT, bannerSrc, prepareBanner } from "../lib/banner";
import { formatSize } from "../lib/attachments";
import { profileCompletion } from "../lib/profileCompletion";
import classes from "./ProfileShowcase.module.css";

const scrollTo = (anchor) => document.getElementById(anchor)?.scrollIntoView({ behavior: "smooth", block: "start" });

/* « Ton profil est complet à 60 % » : barre de progression et les trois conseils les plus utiles. */
export function ProfileCompletion({ profile }) {
  const { t } = useTranslation();
  const { percent, missing } = profileCompletion(profile);
  if (percent >= 100) return null;
  return (
    <section className={classes.completion} aria-labelledby="profile-completion-title">
      <div className={classes.completionHead}>
        <h2 id="profile-completion-title" className={classes.completionTitle}>{t("cv.completionTitle", { percent })}</h2>
        <span className={classes.percent} aria-hidden="true">{percent} %</span>
      </div>
      <div className={classes.bar} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-labelledby="profile-completion-title">
        <span style={{ width: `${percent}%` }} />
      </div>
      <p className={classes.completionHint}>{t("cv.completionHint")}</p>
      <ul className={classes.tips}>
        {missing.slice(0, 3).map((step) => (
          <li key={step.key}>
            <button type="button" className={classes.tip} onClick={() => scrollTo(step.anchor)}>
              <span>{t(`cv.tip_${step.key}`)}</span>
              <span className={classes.tipGain}>+{step.weight} %</span>
              <ArrowRight size={15} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* Bannière et CV, enregistrés dès qu'ils sont choisis. onChange(patch) met le profil à jour. */
export function ProfileMedia({ profile, onChange }) {
  const { t, i18n } = useTranslation();
  const bannerInput = useRef(null);
  const cvInput = useRef(null);
  const [busy, setBusy] = useState(""); // "banner" | "cv" | ""
  const [error, setError] = useState("");
  const banner = bannerSrc(profile);

  const run = async (kind, task) => {
    setError("");
    setBusy(kind);
    try {
      onChange(await task());
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  };

  const pickBanner = (file) =>
    run("banner", async () => {
      let image;
      try {
        image = await prepareBanner(file);
      } catch (err) {
        const code = ["invalidType", "tooLarge"].includes(err.message) ? err.message : "unreadable";
        throw new Error(t(`cv.bannerError_${code}`));
      }
      return api("/user/banner", { method: "PUT", body: JSON.stringify({ image }) });
    });

  const pickCv = (file) =>
    run("cv", async () => {
      const res = await fetch(`${BASE_URL}/user/cv`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}`, "Content-Type": "application/pdf", "X-File-Name": encodeURIComponent(file.name) },
        body: file,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.message || res.statusText);
      return data;
    });

  const cvDate = profile.cv?.updatedAt
    ? new Intl.DateTimeFormat(i18n.language === "en" ? "en-GB" : "fr-CH", { day: "numeric", month: "long", year: "numeric" }).format(new Date(profile.cv.updatedAt))
    : "";

  return (
    <div className={classes.media}>
      <div className={classes.block}>
        <h3 className={classes.blockTitle}>{t("cv.banner")}</h3>
        <p className={classes.blockHint}>{t("cv.bannerHint")}</p>
        <div className={classes.bannerPreview} style={banner ? { backgroundImage: `url("${banner}")` } : undefined}>
          {busy === "banner" && <LoaderCircle size={22} className={classes.spin} aria-hidden="true" />}
          <div className={classes.bannerActions}>
            <button type="button" className={classes.overlayBtn} onClick={() => bannerInput.current?.click()} disabled={!!busy}>
              <ImagePlus size={15} aria-hidden="true" />
              {banner ? t("cv.changeBanner") : t("cv.chooseBanner")}
            </button>
            {banner && (
              <button type="button" className={classes.overlayBtn} onClick={() => run("banner", () => api("/user/banner", { method: "DELETE" }))} disabled={!!busy}>
                <Trash2 size={15} aria-hidden="true" />
                {t("cv.removeBanner")}
              </button>
            )}
          </div>
        </div>
        <input ref={bannerInput} type="file" accept={BANNER_ACCEPT} className="sr-only" tabIndex={-1}
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) pickBanner(f); }} />
      </div>

      <div className={classes.block}>
        <h3 className={classes.blockTitle}>{t("cv.cvFile")}</h3>
        <p className={classes.blockHint}>{t("cv.cvHint")}</p>
        {profile.cv?.name ? (
          <div className={classes.cvRow}>
            <span className={classes.cvIcon} aria-hidden="true"><FileText size={20} /></span>
            <span className={classes.cvText}>
              <strong>{profile.cv.name}</strong>
              <span>{[formatSize(profile.cv.size, i18n.language), cvDate && t("cv.cvUpdated", { date: cvDate })].filter(Boolean).join(" · ")}</span>
            </span>
            <span className={classes.cvActions}>
              <button type="button" className={classes.ghostBtn} onClick={() => cvInput.current?.click()} disabled={!!busy}>
                {busy === "cv" ? t("cv.saving") : t("cv.replaceCv")}
              </button>
              <button type="button" className={classes.iconBtn} onClick={() => run("cv", () => api("/user/cv", { method: "DELETE" }))} disabled={!!busy} aria-label={t("cv.removeCv")} title={t("cv.removeCv")}>
                <Trash2 size={16} aria-hidden="true" />
              </button>
            </span>
          </div>
        ) : (
          <button type="button" className={classes.dropBtn} onClick={() => cvInput.current?.click()} disabled={!!busy}>
            {busy === "cv" ? <LoaderCircle size={18} className={classes.spin} aria-hidden="true" /> : <Upload size={18} aria-hidden="true" />}
            {busy === "cv" ? t("cv.saving") : t("cv.addCv")}
          </button>
        )}
        <input ref={cvInput} type="file" accept="application/pdf,.pdf" className="sr-only" tabIndex={-1}
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) pickCv(f); }} />
      </div>

      {error && <p className={classes.error} role="alert">{error}</p>}
    </div>
  );
}
