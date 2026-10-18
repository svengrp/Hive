import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Check, MapPin, Search, Send, Star, UserPlus, X } from "lucide-react";
import { api } from "../lib/api";
import { useSeo } from "../lib/seo";
import UserAvatar from "../components/UserAvatar";
import HiveRating from "../components/HiveRating";
import PlusBadge from "../components/PlusBadge";
import classes from "./Talents.module.css";

/* Recherche de talents (Hive+) : personnes ayant activé « Disponible pour rejoindre des projets ».
   Sans Hive+, l'API répond 402 avec le nombre de talents disponibles : page de présentation. */
const nameOf = (u) => u?.displayName || [u?.firstName, u?.lastName].filter(Boolean).join(" ") || "";
const isFull = (p) => p.maxParticipants != null && (p.participants?.length || 0) >= p.maxParticipants;
const MAX_SKILLS = 4;

export default function Talents() {
  const { t } = useTranslation();
  useSeo({ title: t("talents.title"), noindex: true });
  const [q, setQ] = useState("");
  const [city, setCity] = useState("");
  const [result, setResult] = useState({ items: [], total: 0, page: 1, hasMore: false });
  const [status, setStatus] = useState("loading"); // loading | ready | locked | error
  const [lockedCount, setLockedCount] = useState(0);
  const [inviting, setInviting] = useState(null); // talent sélectionné
  const [sentTo, setSentTo] = useState(""); // nom pour le message de confirmation
  const debounce = useRef(null);

  const load = useCallback(async (page = 1) => {
    const params = new URLSearchParams({ page: String(page) });
    if (q.trim()) params.set("q", q.trim());
    if (city.trim()) params.set("city", city.trim());
    try {
      const data = await api(`/talents?${params}`);
      setResult((prev) => (page === 1 ? data : { ...data, items: [...prev.items, ...data.items] }));
      setStatus("ready");
    } catch (err) {
      if (err.status === 402) {
        setLockedCount(err.data?.count || 0);
        setStatus("locked");
      } else {
        setStatus("error");
      }
    }
  }, [q, city]);

  // Recherche en direct (légèrement différée pendant la frappe)
  useEffect(() => {
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => load(1), 250);
    return () => clearTimeout(debounce.current);
  }, [load]);

  const onInvited = (talent, projectId) => {
    setResult((prev) => ({
      ...prev,
      items: prev.items.map((u) => (u._id === talent._id ? { ...u, invitedTo: [...(u.invitedTo || []), projectId] } : u)),
    }));
    setSentTo(nameOf(talent));
    setInviting(null);
  };

  if (status === "locked") {
    return (
      <div className={classes.page}>
        <div className={classes.locked}>
          <span className={classes.lockedIcon} aria-hidden="true"><Star size={22} /></span>
          <h1 className={classes.lockedTitle}>{t("talents.lockedTitle")}</h1>
          <p className={classes.lockedText}>{t("talents.lockedText", { count: lockedCount })}</p>
          <Link to="/abonnement" className={classes.primaryBtn}>{t("talents.lockedCta")}</Link>
          <p className={classes.lockedHint}>
            <Link to="/profile">{t("talents.beVisible")}</Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={classes.page}>
      <header className={classes.header}>
        <div className={classes.container}>
          <h1 className={classes.title}>{t("talents.title")}</h1>
          <p className={classes.subtitle}>{t("talents.subtitle")}</p>
        </div>
      </header>

      <div className={classes.container}>
        <div className={classes.filters}>
          <label className={classes.searchField}>
            <Search size={18} aria-hidden="true" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("talents.searchPlaceholder")}
              aria-label={t("talents.searchPlaceholder")}
            />
          </label>
          <label className={`${classes.searchField} ${classes.cityField}`}>
            <MapPin size={18} aria-hidden="true" />
            <input
              type="search"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder={t("talents.cityPlaceholder")}
              aria-label={t("talents.cityPlaceholder")}
            />
          </label>
        </div>

        {sentTo && (
          <p className={classes.success} role="status">
            <Check size={16} aria-hidden="true" />
            <span>{t("talents.inviteSent", { name: sentTo })}</span>
            <button type="button" className={classes.iconBtn} onClick={() => setSentTo("")} aria-label={t("billing.thanksClose")}>
              <X size={14} />
            </button>
          </p>
        )}

        {status === "error" && <p className={classes.error} role="alert">{t("talents.loadError")}</p>}

        {status === "ready" && (
          <>
            <p className={classes.count}>{t("talents.count", { count: result.total })}</p>
            {result.items.length === 0 ? (
              <div className={classes.empty}>
                <p>{t("talents.empty")}</p>
                <p className={classes.emptyHint}>{t("talents.emptyHint")}</p>
              </div>
            ) : (
              <ul className={classes.grid}>
                {result.items.map((talent) => (
                  <TalentCard key={talent._id} talent={talent} onInvite={() => setInviting(talent)} />
                ))}
              </ul>
            )}
            {result.hasMore && (
              <button type="button" className={classes.moreBtn} onClick={() => load(result.page + 1)}>
                {t("talents.loadMore")}
              </button>
            )}
          </>
        )}
      </div>

      {inviting && <InviteDialog talent={inviting} onClose={() => setInviting(null)} onSent={onInvited} />}
    </div>
  );
}

function TalentCard({ talent, onInvite }) {
  const { t } = useTranslation();
  const name = nameOf(talent);
  const location = [talent.address?.city, talent.address?.country].filter(Boolean).join(", ");
  const skills = talent.skills || [];
  return (
    <li className={classes.card}>
      <div className={classes.cardHead}>
        <UserAvatar user={talent} className={classes.avatar} imageClassName={classes.avatarImg} fallbackClassName={classes.avatarFallback} alt="" />
        <div className={classes.identity}>
          <p className={classes.name}>
            <span className={classes.nameText}>{name}</span>
            {talent.plan === "plus" && <PlusBadge />}
          </p>
          {location && <p className={classes.location}><MapPin size={13} aria-hidden="true" />{location}</p>}
          {talent.reputation?.votes > 0 && <HiveRating reputation={talent.reputation} compact />}
        </div>
      </div>
      {talent.bio && <p className={classes.bio}>{talent.bio}</p>}
      {skills.length > 0 && (
        <ul className={classes.skills}>
          {skills.slice(0, MAX_SKILLS).map((s) => <li key={s}>{s}</li>)}
          {skills.length > MAX_SKILLS && <li className={classes.more}>+{skills.length - MAX_SKILLS}</li>}
        </ul>
      )}
      <div className={classes.cardActions}>
        <Link to={`/users/${talent._id}`} className={classes.secondaryBtn}>{t("talents.viewProfile")}</Link>
        <button type="button" className={classes.primaryBtn} onClick={onInvite}>
          <UserPlus size={16} aria-hidden="true" />
          {t("talents.invite")}
        </button>
      </div>
    </li>
  );
}

function InviteDialog({ talent, onClose, onSent }) {
  const { t } = useTranslation();
  const [projects, setProjects] = useState(null);
  const [projectId, setProjectId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dialogRef = useRef(null);
  const name = nameOf(talent);

  useEffect(() => {
    api("/projects/mine")
      .then((list) => {
        const open = (Array.isArray(list) ? list : []).filter((p) => p.status === "open");
        setProjects(open);
        const first = open.find((p) => !talent.invitedTo?.includes(p._id) && !isFull(p) && !p.participants?.includes(talent._id));
        if (first) setProjectId(first._id);
      })
      .catch(() => setProjects([]));
  }, [talent]);

  useEffect(() => {
    dialogRef.current?.focus();
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const send = async (e) => {
    e.preventDefault();
    if (!projectId) return;
    setBusy(true);
    setError("");
    try {
      await api("/invitations", { method: "POST", body: JSON.stringify({ projectId, userId: talent._id, message: message.trim() }) });
      onSent(talent, projectId);
    } catch (err) {
      setError(err.status ? err.message : t("talents.inviteError"));
      setBusy(false);
    }
  };

  return (
    <div className={classes.backdrop} onClick={onClose}>
      <form
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="invite-title"
        className={classes.dialog}
        onClick={(e) => e.stopPropagation()}
        onSubmit={send}
      >
        <div className={classes.dialogHead}>
          <h2 id="invite-title" className={classes.dialogTitle}>{t("talents.inviteTitle", { name })}</h2>
          <button type="button" className={classes.iconBtn} onClick={onClose} aria-label={t("talents.inviteCancel")}><X size={18} /></button>
        </div>

        {projects === null ? null : projects.length === 0 ? (
          <div className={classes.noProject}>
            <p>{t("talents.noOpenProject")}</p>
            <Link to="/create-project" className={classes.primaryBtn}>{t("talents.createProject")}</Link>
          </div>
        ) : (
          <>
            <fieldset className={classes.projectChoice}>
              <legend className={classes.label}>{t("talents.inviteProject")}</legend>
              {projects.map((p) => {
                const already = talent.invitedTo?.includes(p._id) || p.participants?.includes(talent._id);
                const full = isFull(p);
                return (
                  <label key={p._id} className={`${classes.projectOption} ${already || full ? classes.optionDisabled : ""}`}>
                    <input
                      type="radio"
                      name="project"
                      value={p._id}
                      checked={projectId === p._id}
                      disabled={already || full}
                      onChange={() => setProjectId(p._id)}
                    />
                    <span className={classes.projectName}>{p.title}</span>
                    {(already || full) && <span className={classes.optionNote}>{already ? t("talents.alreadyInvited") : t("talents.full")}</span>}
                  </label>
                );
              })}
            </fieldset>

            <label className={classes.label} htmlFor="invite-message">{t("talents.inviteMessage")}</label>
            <textarea
              id="invite-message"
              className={classes.textarea}
              value={message}
              maxLength={300}
              rows={3}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t("talents.inviteMessagePlaceholder")}
            />
            <p className={classes.counter}>{message.length}/300</p>

            {error && <p className={classes.error} role="alert">{error}</p>}

            <div className={classes.dialogActions}>
              <button type="button" className={classes.secondaryBtn} onClick={onClose}>{t("talents.inviteCancel")}</button>
              <button type="submit" className={classes.primaryBtn} disabled={!projectId || busy}>
                <Send size={16} aria-hidden="true" />
                {t("talents.inviteSend")}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
