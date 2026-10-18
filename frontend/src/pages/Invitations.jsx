import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { MapPin, Users } from "lucide-react";
import { api } from "../lib/api";
import { useSeo } from "../lib/seo";
import ProjectCover from "../components/ProjectCover";
import PlusBadge from "../components/PlusBadge";
import classes from "./Talents.module.css";

/* Invitations reçues (recherche de talents Hive+) : rejoindre le projet ou refuser discrètement. */
const nameOf = (u) => u?.displayName || [u?.firstName, u?.lastName].filter(Boolean).join(" ") || "";

export default function Invitations() {
  const { t } = useTranslation();
  useSeo({ title: t("invitations.title"), noindex: true });
  const navigate = useNavigate();
  const [items, setItems] = useState(null);
  const [busyId, setBusyId] = useState("");
  const [feedback, setFeedback] = useState(null); // { type, text }

  useEffect(() => {
    api("/invitations/mine").then((list) => setItems(Array.isArray(list) ? list : [])).catch(() => setItems([]));
  }, []);

  const respond = async (inv, action) => {
    setBusyId(inv._id);
    setFeedback(null);
    try {
      const data = await api(`/invitations/${inv._id}/${action}`, { method: "PUT" });
      if (action === "accept") {
        navigate(`/messages?group=${data.conversationId}`);
        return;
      }
      setItems((prev) => prev.filter((i) => i._id !== inv._id));
      setFeedback({ type: "ok", text: t("invitations.declined") });
    } catch (err) {
      setFeedback({ type: "error", text: err.status ? err.message : t("invitations.error") });
    } finally {
      setBusyId("");
    }
  };

  return (
    <div className={classes.page}>
      <header className={classes.header}>
        <div className={classes.container}>
          <h1 className={classes.title}>{t("invitations.title")}</h1>
          <p className={classes.subtitle}>{t("invitations.subtitle")}</p>
        </div>
      </header>

      <div className={classes.container}>
        {feedback && (
          <p className={feedback.type === "ok" ? classes.success : classes.error} role={feedback.type === "ok" ? "status" : "alert"}>
            {feedback.text}
          </p>
        )}

        {items && items.length === 0 && (
          <div className={classes.empty}>
            <p>{t("invitations.empty")}</p>
            <p className={classes.emptyHint}>{t("invitations.emptyHint")}</p>
            <p className={classes.emptyHint}><Link to="/profile">{t("invitations.goProfile")}</Link></p>
          </div>
        )}

        {items && items.length > 0 && (
          <ul className={classes.inviteList}>
            {items.map((inv) => {
              const p = inv.projectId;
              const place = [p.projectMeta?.city, p.projectMeta?.region].filter(Boolean).join(", ");
              const spots = p.maxParticipants != null ? Math.max(p.maxParticipants - (p.participants?.length || 0), 0) : null;
              return (
                <li key={inv._id} className={classes.inviteCard}>
                  <Link to={`/projects/${p._id}`} className={classes.inviteCover} aria-hidden="true" tabIndex={-1}>
                    <ProjectCover project={p} size="thumb" />
                  </Link>
                  <div className={classes.inviteBody}>
                    <h2 className={classes.inviteTitle}><Link to={`/projects/${p._id}`}>{p.title}</Link></h2>
                    <p className={classes.inviteMeta}>
                      {t("invitations.invitedBy", { name: nameOf(inv.inviterId) })}
                      {inv.inviterId?.plan === "plus" && <PlusBadge />}
                    </p>
                    <p className={classes.inviteMeta}>
                      {place && <><MapPin size={13} aria-hidden="true" />{place}</>}
                      {spots != null && <> · <Users size={13} aria-hidden="true" />{t("invitations.spots", { count: spots })}</>}
                    </p>
                    {inv.message && <p className={classes.inviteQuote}>{inv.message}</p>}
                    <div className={classes.inviteActions}>
                      <button type="button" className={classes.primaryBtn} disabled={busyId === inv._id} onClick={() => respond(inv, "accept")}>
                        {t("invitations.accept")}
                      </button>
                      <Link to={`/projects/${p._id}`} className={classes.secondaryBtn}>{t("invitations.viewProject")}</Link>
                      <button type="button" className={classes.secondaryBtn} disabled={busyId === inv._id} onClick={() => respond(inv, "decline")}>
                        {t("invitations.decline")}
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
