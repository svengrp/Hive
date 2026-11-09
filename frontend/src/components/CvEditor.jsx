import { useState } from "react";
import { Plus, PencilLine, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import { formatPeriod, orgBadge, sortTimeline } from "../lib/cv";
import classes from "./CvEditor.module.css";

const KINDS = {
  experiences: {
    title: "cv.experience",
    add: "cv.addExperience",
    empty: "cv.noExperience",
    main: "title",
    sub: "organization",
    blank: { title: "", organization: "", location: "", start: "", end: "", current: false, description: "" },
  },
  formations: {
    title: "cv.formations",
    add: "cv.addFormation",
    empty: "cv.noFormation",
    main: "school",
    sub: "degree",
    blank: { school: "", degree: "", start: "", end: "", current: false, description: "" },
  },
};

const YEARS = (() => {
  const now = new Date().getFullYear();
  return Array.from({ length: now + 6 - 1960 }, (_, i) => now + 5 - i);
})();

/* Sélecteur mois + année → « AAAA-MM » (ou « AAAA » sans mois, vide sans année). */
function MonthField({ label, value, onChange, disabled, lang }) {
  const { t } = useTranslation();
  const [savedYear = "", savedMonth = ""] = (value || "").split("-");
  // Un mois choisi avant l'année est gardé ici en attendant l'année (« -09 » n'est pas une date valide)
  const [pendingMonth, setPendingMonth] = useState("");
  const year = savedYear;
  const month = savedYear ? savedMonth : pendingMonth;
  const months = Array.from({ length: 12 }, (_, i) =>
    new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "fr-CH", { month: "long" }).format(new Date(2024, i, 1)),
  );
  const emit = (y, m) => {
    setPendingMonth(y ? "" : m);
    onChange(y ? (m ? `${y}-${m}` : y) : "");
  };
  return (
    <fieldset className={classes.dateField} disabled={disabled}>
      <legend className={classes.label}>{label}</legend>
      <div className={classes.dateRow}>
        <select className={classes.input} aria-label={`${label} : ${t("cv.month")}`} value={month} onChange={(e) => emit(year, e.target.value)}>
          <option value="">{t("cv.month")}</option>
          {months.map((name, i) => (
            <option key={name} value={String(i + 1).padStart(2, "0")}>{name}</option>
          ))}
        </select>
        <select className={classes.input} aria-label={`${label} : ${t("cv.year")}`} value={year} onChange={(e) => emit(e.target.value, month)}>
          <option value="">{t("cv.year")}</option>
          {YEARS.map((y) => (
            <option key={y} value={String(y)}>{y}</option>
          ))}
        </select>
      </div>
    </fieldset>
  );
}

/* Une liste du parcours (expériences ou formations) : chaque ajout, modification ou retrait est enregistré tout de suite. */
function TimelineEditor({ kind, list, onSave }) {
  const { t, i18n } = useTranslation();
  const k = KINDS[kind];
  const [editing, setEditing] = useState(null); // { index: number | null, draft }
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const set = (field, value) => setEditing((cur) => ({ ...cur, draft: { ...cur.draft, [field]: value } }));

  const persist = async (next) => {
    setSaving(true);
    setError("");
    try {
      await onSave(next);
      setEditing(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const validate = () => {
    const d = editing.draft;
    if (!d[k.main].trim()) return setError(t(kind === "experiences" ? "cv.titleRequired" : "cv.schoolRequired"));
    if (!d.current && d.start && d.end && d.end < d.start) return setError(t("cv.endBeforeStart"));
    const clean = { ...d, end: d.current ? "" : d.end };
    const next = editing.index === null ? [...list, clean] : list.map((e, i) => (i === editing.index ? clean : e));
    persist(next);
  };

  const remove = (index) => persist(list.filter((_, i) => i !== index));

  const form = editing && (
    <div className={classes.form}>
      <div className={classes.grid2}>
        <label className={classes.field}>
          <span className={classes.label}>{t(kind === "experiences" ? "cv.title" : "cv.school")} *</span>
          <input
            className={classes.input}
            value={editing.draft[k.main]}
            maxLength={kind === "experiences" ? 80 : 100}
            placeholder={t(kind === "experiences" ? "cv.titlePlaceholder" : "cv.schoolPlaceholder")}
            onChange={(e) => set(k.main, e.target.value)}
            autoFocus
          />
        </label>
        <label className={classes.field}>
          <span className={classes.label}>{t(kind === "experiences" ? "cv.organization" : "cv.degree")}</span>
          <input
            className={classes.input}
            value={editing.draft[k.sub]}
            maxLength={kind === "experiences" ? 80 : 120}
            placeholder={t(kind === "experiences" ? "cv.organizationPlaceholder" : "cv.degreePlaceholder")}
            onChange={(e) => set(k.sub, e.target.value)}
          />
        </label>
      </div>
      {kind === "experiences" && (
        <label className={classes.field}>
          <span className={classes.label}>{t("cv.location")}</span>
          <input className={classes.input} value={editing.draft.location} maxLength={80} placeholder="Genève" onChange={(e) => set("location", e.target.value)} />
        </label>
      )}
      <div className={classes.grid2}>
        <MonthField label={t("cv.start")} value={editing.draft.start} onChange={(v) => set("start", v)} lang={i18n.language} />
        <MonthField label={t("cv.end")} value={editing.draft.current ? "" : editing.draft.end} onChange={(v) => set("end", v)} disabled={editing.draft.current} lang={i18n.language} />
      </div>
      <label className={classes.check}>
        <input type="checkbox" checked={editing.draft.current} onChange={(e) => set("current", e.target.checked)} />
        {t("cv.current")}
      </label>
      <label className={classes.field}>
        <span className={classes.label}>{t("cv.description")}</span>
        <textarea
          className={classes.textarea}
          rows={4}
          value={editing.draft.description}
          maxLength={kind === "experiences" ? 1500 : 1000}
          placeholder={t("cv.descriptionPlaceholder")}
          onChange={(e) => set("description", e.target.value)}
        />
      </label>
      {error && <p className={classes.error} role="alert">{error}</p>}
      <div className={classes.formActions}>
        <button type="button" className={classes.ghostBtn} onClick={() => { setEditing(null); setError(""); }} disabled={saving}>
          {t("cv.cancel")}
        </button>
        <button type="button" className={classes.primaryBtn} onClick={validate} disabled={saving}>
          {t("cv.save")}
        </button>
      </div>
    </div>
  );

  // Affichage trié comme sur le profil public, en gardant l'index réel pour modifier ou retirer
  const ordered = sortTimeline(list.map((e, index) => ({ ...e, __index: index })));

  return (
    <div className={classes.block}>
      <div className={classes.blockHead}>
        <h4 className={classes.blockTitle}>{t(k.title)}</h4>
        {!editing && (
          <button type="button" className={classes.addBtn} onClick={() => setEditing({ index: null, draft: { ...k.blank } })}>
            <Plus size={15} />
            {t(k.add)}
          </button>
        )}
      </div>
      {editing?.index === null && form}
      {list.length === 0 && !editing && <p className={classes.empty}>{t(k.empty)}</p>}
      <ul className={classes.list}>
        {ordered.map((entry) => {
          const index = entry.__index;
          if (editing?.index === index) return <li key={index}>{form}</li>;
          const badge = orgBadge(kind === "experiences" ? entry.organization || entry.title : entry.school);
          return (
            <li key={index} className={classes.row}>
              <span className={classes.badge} style={{ "--badge": badge.color }} aria-hidden="true">{badge.letter}</span>
              <div className={classes.rowText}>
                <strong>{entry[k.main]}</strong>
                {entry[k.sub] && <span>{entry[k.sub]}</span>}
                <span className={classes.muted}>{formatPeriod(entry, t, i18n.language)}</span>
              </div>
              <div className={classes.rowActions}>
                <button type="button" className={classes.iconBtn} aria-label={t("cv.edit")} title={t("cv.edit")} disabled={!!editing || saving}
                  onClick={() => setEditing({ index, draft: { ...k.blank, ...list[index] } })}>
                  <PencilLine size={16} />
                </button>
                <button type="button" className={classes.iconBtn} aria-label={t("cv.remove")} title={t("cv.remove")} disabled={!!editing || saving}
                  onClick={() => remove(index)}>
                  <Trash2 size={16} />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {error && !editing && <p className={classes.error} role="alert">{error}</p>}
    </div>
  );
}

/* Parcours du profil (Mon profil) : expériences et formations, enregistrées à chaque validation.
   Les anciennes formations en texte libre (education) sont reprises comme formations au premier enregistrement. */
export default function CvEditor({ profile, onSaved }) {
  const { t } = useTranslation();
  const strip = (list) => (list || []).map(({ _id, __index, ...rest }) => rest);
  const [experiences, setExperiences] = useState(strip(profile.experiences));
  const [formations, setFormations] = useState(
    profile.formations?.length ? strip(profile.formations) : (profile.education || []).map((school) => ({ ...KINDS.formations.blank, school })),
  );

  const save = (kind) => async (next) => {
    const body = { [kind]: strip(next) };
    if (kind === "formations") body.education = [];
    const updated = await api("/user/profile", { method: "PUT", body: JSON.stringify(body) });
    if (kind === "experiences") setExperiences(strip(updated.experiences));
    else setFormations(strip(updated.formations));
    onSaved?.(updated);
  };

  return (
    <div className={classes.editor}>
      <p className={classes.hint}>{t("cv.timelineHint")}</p>
      <TimelineEditor kind="experiences" list={experiences} onSave={save("experiences")} />
      <TimelineEditor kind="formations" list={formations} onSave={save("formations")} />
    </div>
  );
}
