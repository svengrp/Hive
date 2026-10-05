import { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { MapContainer, Marker } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { ArrowLeft, Check, Clock, DollarSign, GitBranch, MapPin, Pencil, Star, UserPlus, UserRound, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import { useSeo } from "../lib/seo";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import BaseMapLayers from "../components/BaseMapLayers";
import HiveRating from "../components/HiveRating";
import UserAvatar from "../components/UserAvatar";
import ProjectCover from "../components/ProjectCover";
import BoostPanel from "../components/BoostPanel";
import { isBoosted } from "../lib/billing";
import classes from "./ProjectDetails.module.css";

// ── Icône carte ──────────────────────────────────────────────────────────────
function svgToDataUrl(svg) {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function createIcon(size, iconUrl = "/location-pin.png") {
  return L.icon({ iconUrl, iconSize: size, iconAnchor: [size[0] / 2, size[1]], popupAnchor: [0, -size[1]] });
}

const projectIcon = createIcon(
  [34, 42],
  svgToDataUrl(`
    <svg width="34" height="42" viewBox="0 0 34 42" xmlns="http://www.w3.org/2000/svg">
      <defs><filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
        <feDropShadow dx="0" dy="4" stdDeviation="3" flood-color="#1a1008" flood-opacity="0.28"/>
      </filter></defs>
      <g filter="url(#shadow)">
        <path d="M17 2C9.82 2 4 7.82 4 15c0 9.45 11.2 20.84 12.45 22.08a.78.78 0 0 0 1.1 0C18.8 35.84 30 24.45 30 15 30 7.82 24.18 2 17 2Z" fill="#E8962A"/>
        <path d="M17 5.2c5.4 0 9.8 4.4 9.8 9.8 0 6.03-6.15 13.96-9.8 17.82C13.35 28.96 7.2 21.03 7.2 15c0-5.4 4.4-9.8 9.8-9.8Z" fill="#2A1D10"/>
        <ellipse cx="17" cy="14.8" rx="6.3" ry="7.2" fill="#FFF6E6"/>
        <path d="M12.7 16.1 14.7 18.2 16 15.2 17.2 17.5 18.8 14.5 20.8 18 21.5 17.2" fill="none" stroke="#2A1D10" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M11.95 16.85c.25 3.7 2.48 6.42 5.05 6.42 2.63 0 4.85-2.79 5.06-6.57l-1 1.01c-.28.28-.74.2-.91-.16l-1.13-2.23-1.3 2.49c-.22.42-.81.43-1.04.02l-.85-1.57-.99 2.26c-.18.42-.73.52-1.04.19l-1.85-1.86Z" fill="#E8962A"/>
      </g>
    </svg>
  `)
);

// ── Composant ─────────────────────────────────────────────────────────────────
export default function ProjectDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useTranslation();
  const { theme } = useTheme();

  // ── States ──────────────────────────────────────────────────────────────────
  const [project, setProject]           = useState(null);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState("");
  const [joinStatus, setJoinStatus]     = useState(null);
  const [joinRequests, setJoinRequests] = useState([]);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [joinMessage, setJoinMessage]   = useState("");
  const [joinLoading, setJoinLoading]   = useState(false);
  const [toast, setToast]               = useState(null);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [closeLoading, setCloseLoading]         = useState(false);
  const [showRatingModal, setShowRatingModal]   = useState(false);
  const [ratingTarget, setRatingTarget]         = useState(null);
  const [ratingScore, setRatingScore]           = useState(0);
  const [ratingComment, setRatingComment]       = useState("");
  const [ratingLoading, setRatingLoading]       = useState(false);
  const [ratedUsers, setRatedUsers]             = useState(new Set());
  const [showLeaveModal, setShowLeaveModal]     = useState(false);
  const [leaveMessage, setLeaveMessage]         = useState("");
  const [leaveLoading, setLeaveLoading]         = useState(false);

  // Boost appliqué (crédit Hive+ ou paiement confirmé) : mise à jour locale du projet
  const onBoosted = useCallback((boostedUntil) => {
    setProject((prev) => (prev ? { ...prev, boostedUntil } : prev));
  }, []);

  // ── useEffects ──────────────────────────────────────────────────────────────
  useEffect(() => {
    api(`/projects/${id}`)
      .then((data) => setProject(data))
      .catch(() => setError(t("projectDetails.notFound")))
      .finally(() => setLoading(false));
  }, [id, t]);

  // Seuls les projets ouverts et publics sont indexés (même règle que le sitemap)
  useSeo({
    title: project?.title || (error ? t("seo.notFoundTitle") : ""),
    description: project?.description,
    path: `/projects/${id}`,
    noindex: !!error || (!!project && (project.visibility !== "public" || project.status !== "open")),
  });

  useEffect(() => {
    if (!project || !user) return;
    const uid = user?._id || user?.id;
    const ownerIsMe = uid && project.ownerId?._id && uid === project.ownerId._id;
    if (ownerIsMe) return;
    api(`/requests/${id}/mine`)
      .then((data) => setJoinStatus(data?.status || null))
      .catch(console.error);
  }, [id, project, user]);

  useEffect(() => {
    if (!project || !user) return;
    const uid = user?._id || user?.id;
    const ownerIsMe = uid && project.ownerId?._id && uid === project.ownerId._id;
    if (!ownerIsMe) return;
    api(`/requests/${id}/list`)
      .then((data) => setJoinRequests(Array.isArray(data) ? data : []))
      .catch(console.error);
  }, [id, project, user]);
  
  useEffect(() => {
    if (!project || !user) return;
    const projectId = project?._id || project?.id
    api(`/projects/${projectId}/view`, {method : "POST"});
  }, [project, user]);

  // ── Handlers ────────────────────────────────────────────────────────────────
  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const handleJoin = async () => {
    setJoinLoading(true);
    try {
      await api(`/requests/${id}`, {
        method: "POST",
        body: JSON.stringify({ message: joinMessage }),
      });
      setJoinStatus("pending");
      setShowJoinModal(false);
      setJoinMessage("");
      showToast("Demande envoyée — en attente de réponse !");
    } catch (err) {
      alert(err.message || "Erreur");
    } finally {
      setJoinLoading(false);
    }
  };

  const handleAccept = async (reqId) => {
    try {
      await api(`/requests/${reqId}/accept`, { method: "PUT" });
      setJoinRequests((prev) => prev.filter((r) => r._id !== reqId));
    } catch (err) {
      alert(err.message || "Erreur");
    }
  };

  const handleDecline = async (reqId) => {
    try {
      await api(`/requests/${reqId}/decline`, { method: "PUT" });
      setJoinRequests((prev) => prev.filter((r) => r._id !== reqId));
    } catch (err) {
      alert(err.message || "Erreur");
    }
  };

  const handleCloseProject = async () => {
    setCloseLoading(true);
    try {
      await api(`/projects/${id}/close`, { method: "POST" });
      setProject((prev) => ({ ...prev, status: "closed" }));
      setShowCloseConfirm(false);
      showToast("Projet clôturé — les membres peuvent maintenant se noter.");
    } catch (err) {
      alert(err.message || "Erreur");
    } finally {
      setCloseLoading(false);
    }
  };

  const handleLeave = async () => {
    setLeaveLoading(true);
    try {
      await api(`/projects/${id}/leave`, {
        method: "POST",
        body: JSON.stringify({ message: leaveMessage }),
      });
      setShowLeaveModal(false);
      showToast("Vous avez quitté le projet.");
      navigate("/projects");
    } catch (err) {
      alert(err.message || "Erreur");
    } finally {
      setLeaveLoading(false);
    }
  };

  const openRatingModal = (participant) => {
    setRatingTarget(participant);
    setRatingScore(0);
    setRatingComment("");
    setShowRatingModal(true);
  };

  const handleRate = async () => {
    if (!ratingScore) return alert("Sélectionne une note (1-5)");
    setRatingLoading(true);
    try {
      await api(`/projects/${id}/rate`, {
        method: "POST",
        body: JSON.stringify({ targetId: ratingTarget._id, score: ratingScore, comment: ratingComment }),
      });
      setRatedUsers((prev) => new Set([...prev, ratingTarget._id]));
      setShowRatingModal(false);
      showToast(`${ratingTarget.displayName || ratingTarget.firstName} noté·e !`);
    } catch (err) {
      alert(err.message || "Erreur");
    } finally {
      setRatingLoading(false);
    }
  };

  // ── Early returns ────────────────────────────────────────────────────────────
  if (loading) return <div className={classes.center}>{t("projectDetails.loading")}</div>;

  if (error || !project) {
    return (
      <div className={classes.center}>
        <p>{error || t("projectDetails.notFound")}</p>
        <button className={classes.backBtn} onClick={() => navigate("/projects")}>
          {t("projectDetails.backToProjects")}
        </button>
      </div>
    );
  }

  // ── Valeurs calculées ────────────────────────────────────────────────────────
  const STATUS_LABELS = {
    open:     { label: t("projectDetails.statusOpen"),     color: "#5FA86A" },
    closed:   { label: t("projectDetails.statusClosed"),   color: "#E5484D" },
    draft:    { label: t("projectDetails.statusDraft"),    color: "#94a3b8" },
    archived: { label: t("projectDetails.statusArchived"), color: "#C79A4A" },
  };

  const coords = project.location?.coordinates;
  const hasLocation = coords && coords.length === 2 && !(coords[0] === 0 && coords[1] === 0);
  const mapCenter = hasLocation ? [coords[1], coords[0]] : null;
  const projectLocationLabel = [project.projectMeta?.city, project.projectMeta?.region].filter(Boolean).join(", ");

  const status = STATUS_LABELS[project.status] || STATUS_LABELS.open;
  const participantCount = (project.participants?.length || 0) + 1;

  const formatDate = (dateStr) => {
    if (!dateStr) return null;
    return new Date(dateStr).toLocaleDateString("fr-CH", { day: "numeric", month: "long", year: "numeric" });
  };

  const formatShortDate = (dateStr) => {
    if (!dateStr) return null;
    return new Date(dateStr).toLocaleDateString("fr-CH", { day: "2-digit", month: "short", year: "numeric" });
  };

  const formatAgeRange = (minAge, maxAge) => {
    if (minAge && maxAge) return t("projectDetails.ageFromTo", { min: minAge, max: maxAge });
    if (minAge) return t("projectDetails.ageMin", { min: minAge });
    if (maxAge) return t("projectDetails.ageMax", { max: maxAge });
    return null;
  };

  const startDate = formatDate(project.projectMeta?.startDate);
  const endDate = formatDate(project.projectMeta?.endDate);
  const ageRange = formatAgeRange(project.minAge, project.maxAge);
  const hasExtraInfo = project.projectMeta?.budget > 0 || Boolean(project.projectMeta?.repoUrl);

  const owner = project.ownerId;
  const currentUserId = user?._id || user?.id;
  const isOwner = currentUserId && owner?._id && currentUserId === owner._id;
  const isParticipant = project.participants?.some(p => (p._id || p)?.toString() === currentUserId?.toString());
  const ownerName = isOwner
    ? t("projectDetails.you")
    : owner?.displayName || [owner?.firstName, owner?.lastName].filter(Boolean).join(" ") || t("projectDetails.unknownCreator");
  const ownerLocation = [owner?.address?.city, owner?.address?.country].filter(Boolean).join(", ");

  // ── JSX ──────────────────────────────────────────────────────────────────────
  return (
    <div className={classes.page}>

      {/* HERO : image de couverture derrière le titre, fondue dans la page */}
      <div className={classes.hero}>
        <ProjectCover project={project} size="full" showInitials={false} className={classes.heroCover} />
        <div className={classes.heroScrim} aria-hidden="true" />

        <div className={classes.topBar}>
          <button className={classes.backBtn} onClick={() => navigate("/projects")}>
            <ArrowLeft size={16} />
            {t("projectDetails.backToProjects")}
          </button>
        </div>

        <div className={classes.heroInner}>
          <div className={classes.heroText}>
          <div className={classes.heroTop}>
            <span className={classes.statusBadge} style={{ "--badge-color": status.color }}>
              {status.label}
            </span>
            {isBoosted(project) && <span className={classes.boostedBadge}>{t("billing.boosted")}</span>}
            {project.cached?.avgRating > 0 && (
              <span className={classes.rating}>
                <HiveRating reputation={{ rating: project.cached.avgRating }} compact />
              </span>
            )}
          </div>
          <h1 className={classes.title}>{project.title}</h1>
          {(project.projectMeta?.city || project.projectMeta?.region) && (
            <div className={classes.heroLocation}>
              <MapPin size={15} />
              {[project.projectMeta.city, project.projectMeta.region].filter(Boolean).join(", ")}
            </div>
          )}
          </div>
          {/* REJOINDRE — l'action principale, visible dès l'arrivée sur la page */}
          {user && !isOwner && project.status === "open" && user.role !== 'admin' && (
            <div className={classes.heroJoin}>
              {joinStatus === "pending" && (
                <p className={classes.joinPending}><Clock size={14} /> {t("projectDetails.joinPending")}</p>
              )}
              {joinStatus === "accepted" && isParticipant && (
                <div className={classes.joinMemberBlock}>
                  <p className={classes.joinAccepted}><Check size={14} /> {t("projectDetails.joinAccepted")}</p>
                  <button
                    type="button"
                    className={classes.leaveBtn}
                    onClick={() => setShowLeaveModal(true)}
                  >
                    Quitter le projet
                  </button>
                </div>
              )}
              {joinStatus === "declined" && (
                <p className={classes.joinDeclined}><X size={14} /> {t("projectDetails.joinDeclined")}</p>
              )}
              {joinStatus === "kicked" && (
                <p className={classes.joinDeclined}><X size={14} /> {t("projectDetails.joinKicked")}</p>
              )}
              {(!joinStatus || joinStatus === "expired" || (joinStatus === "accepted" && !isParticipant)) && (
                <button type="button" className={classes.joinBtn} onClick={() => setShowJoinModal(true)}>
                  <UserPlus size={16} />
                  {t("projectDetails.joinBtn")}
                </button>
              )}
            </div>
          )}

          {/* ACTIONS DU CRÉATEUR */}
          {isOwner && (
            <div className={classes.heroOwnerActions}>
              <button type="button" className={classes.editProjectBtn} onClick={() => navigate(`/projects/${project._id}/edit`)}>
                <Pencil size={16} aria-hidden="true" />
                {t("projectDetails.editProject")}
              </button>
              {project.status === "open" && (
                <button type="button" className={classes.closeProjectBtn} onClick={() => setShowCloseConfirm(true)}>
                  {t("projectDetails.closeProject")}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* PANEL DEMANDES — visible uniquement par le owner */}
      {isOwner && joinRequests.length > 0 && (
        <div className={classes.requestsPanel}>
          <h2 className={classes.requestsTitle}>
            Demandes de participation ({joinRequests.length})
          </h2>
          <ul className={classes.requestsList}>
            {joinRequests.map((req) => {
              const name = req.senderId?.displayName ||
                [req.senderId?.firstName, req.senderId?.lastName].filter(Boolean).join(" ") ||
                "Utilisateur";
              return (
                <li key={req._id} className={classes.requestItem}>
                  <button
                    type="button"
                    className={classes.requestUser}
                    onClick={() => navigate(`/users/${req.senderId?._id}`)}
                  >
                    <UserAvatar
                      user={req.senderId}
                      className={classes.requestAvatar}
                      imageClassName={classes.requestAvatarImg}
                      fallbackClassName={classes.requestAvatarFallback}
                      alt={name}
                    />
                    <div className={classes.requestMeta}>
                      <strong>{name}</strong>
                      {req.message && <span className={classes.requestMsg}>« {req.message} »</span>}
                      {req.expiresAt && (
                        <span className={classes.requestExpires}>
                          Expire le {formatShortDate(req.expiresAt)}
                        </span>
                      )}
                    </div>
                  </button>
                  <div className={classes.requestActions}>
                    <button type="button" className={classes.acceptBtn} onClick={() => handleAccept(req._id)}>
                      <Check size={14} /> Accepter
                    </button>
                    <button type="button" className={classes.declineBtn} onClick={() => handleDecline(req._id)}>
                      <X size={14} /> Refuser
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* CONTENT */}
      <div className={classes.content}>

        {/* LEFT */}
        <div className={classes.main}>
          <section className={classes.summaryGrid}>
            <div className={classes.summaryCard}>
              <span className={classes.summaryLabel}>{t("projectDetails.participants")}</span>
              <strong>{participantCount}{project.maxParticipants ? ` / ${project.maxParticipants}` : ""}</strong>
            </div>
            {ageRange && (
              <div className={classes.summaryCard}>
                <span className={classes.summaryLabel}>{t("projectDetails.ageRange")}</span>
                <strong>{ageRange}</strong>
              </div>
            )}
            {(startDate || endDate) && (
              <div className={classes.summaryCard}>
                <span className={classes.summaryLabel}>{t("projectDetails.duration")}</span>
                <strong>{startDate}{endDate ? ` → ${endDate}` : ` ${t("projectDetails.recurring")}`}</strong>
              </div>
            )}
          </section>

          {project.description && (
            <section className={classes.section}>
              <h2 className={classes.sectionTitle}>{t("projectDetails.description")}</h2>
              <p className={classes.description}>{project.description}</p>
            </section>
          )}

          {project.tags?.length > 0 && (
            <section className={classes.section}>
              <h2 className={classes.sectionTitle}>{t("projectDetails.tags")}</h2>
              <div className={classes.tagList}>
                {project.tags.map((tag, i) => <span key={i} className={classes.tag}>{tag}</span>)}
              </div>
            </section>
          )}

          {project.requiredSkills?.length > 0 && (
            <section className={classes.section}>
              <h2 className={classes.sectionTitle}>{t("projectDetails.skills")}</h2>
              <div className={classes.tagList}>
                {project.requiredSkills.map((s, i) => <span key={i} className={`${classes.tag} ${classes.tagSkill}`}>{s}</span>)}
              </div>
            </section>
          )}

          {project.langues?.length > 0 && (
            <section className={classes.section}>
              <h2 className={classes.sectionTitle}>{t("projectDetails.languages")}</h2>
              <div className={classes.tagList}>
                {project.langues.map((l, i) => <span key={i} className={`${classes.tag} ${classes.tagLang}`}>{l}</span>)}
              </div>
            </section>
          )}

        </div>

        {/* RIGHT */}
        <aside className={classes.aside}>

          {/* VISIBILITÉ (propriétaire) : boost + statistiques */}
          {isOwner && <BoostPanel project={project} onBoosted={onBoosted} />}

          {/* OWNER */}
          {owner && (
            <div className={classes.ownerCard}>
              <div className={classes.ownerHeader}>
                <span className={classes.cardTitle}>{t("projectDetails.owner")}</span>
              </div>
              <button
                type="button"
                className={classes.ownerButton}
                onClick={() => navigate(isOwner ? "/profile" : `/users/${owner._id}`)}
              >
                <UserAvatar
                  user={owner}
                  className={classes.ownerAvatar}
                  imageClassName={classes.ownerAvatarImage}
                  fallbackClassName={classes.ownerAvatarFallback}
                  alt={`Profil de ${ownerName}`}
                />
                <div className={classes.ownerMeta}>
                  <div className={classes.ownerTopRow}>
                    <div className={classes.ownerIdentity}>
                      <strong className={classes.ownerName}>
                        {ownerName}
                        {owner?.plan === "plus" && <span className={classes.plusBadge}>{t("billing.plusBadge")}</span>}
                      </strong>
                      {ownerLocation && <span className={classes.ownerLocation}>{ownerLocation}</span>}
                    </div>
                    <span className={classes.ownerAction}>
                      <UserRound size={15} />
                      {t("projectDetails.viewProfile")}
                    </span>
                  </div>
                  <div className={classes.ownerRating}>
                    <HiveRating reputation={owner?.reputation} compact />
                  </div>
                  {owner?.bio && <p>{owner.bio}</p>}
                </div>
              </button>
            </div>
          )}

          {/* INFOS EXTRAS */}
          {hasExtraInfo && (
            <div className={classes.infoCard}>
              <h2 className={classes.cardTitle}>{t("projectDetails.infoTitle")}</h2>
              <div className={classes.infoList}>
                {project.projectMeta?.budget > 0 && (
                  <div className={classes.infoRow}>
                    <DollarSign size={16} className={classes.infoIcon} />
                    <div>
                      <div className={classes.infoLabel}>{t("projectDetails.budget")}</div>
                      <div className={classes.infoValue}>{project.projectMeta.budget.toLocaleString("fr-CH")} CHF</div>
                    </div>
                  </div>
                )}
                {project.projectMeta?.repoUrl && (
                  <div className={classes.infoRow}>
                    <GitBranch size={16} className={classes.infoIcon} />
                    <div>
                      <div className={classes.infoLabel}>{t("projectDetails.repository")}</div>
                      <a href={project.projectMeta.repoUrl} target="_blank" rel="noreferrer" className={classes.repoLink}>
                        {t("projectDetails.viewRepo")}
                      </a>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* MAP */}
          <div className={classes.mapCard}>
            <h2 className={classes.cardTitle}>{t("projectDetails.mapTitle")}</h2>
            {mapCenter ? (
              <>
                <div className={classes.mapPreview}>
                  <MapContainer center={mapCenter} zoom={11} style={{ height: "100%", width: "100%" }} scrollWheelZoom={false}>
                    <BaseMapLayers theme={theme} />
                    <Marker position={mapCenter} icon={projectIcon} />
                  </MapContainer>
                </div>
                {projectLocationLabel && (
                  <p className={classes.mapLabel}><MapPin size={13} />{projectLocationLabel}</p>
                )}
              </>
            ) : (
              <p className={classes.mapFallback}>{t("projectDetails.noLocation")}</p>
            )}
          </div>

        </aside>
      </div>

      {/* SECTION NOTATION — projet clôturé, membre ou owner */}
      {project.status === "closed" && user && (isOwner || isParticipant) && (
        <div className={classes.ratingSection}>
          <div className={classes.ratingSectionInner}>
            <h2 className={classes.ratingSectionTitle}>Évaluer les participants</h2>
            <p className={classes.ratingSectionSub}>Le projet est clôturé — notez chaque membre de 1 à 5.</p>
            <ul className={classes.ratingList}>
              {[...(isOwner ? [] : [{ ...owner, _id: owner._id }]), ...(project.participants || [])]
                .filter(p => (p._id || p)?.toString() !== currentUserId?.toString())
                .map((p) => {
                  const pid = p._id?.toString();
                  const name = p.displayName || [p.firstName, p.lastName].filter(Boolean).join(" ") || "Utilisateur";
                  const done = ratedUsers.has(pid);
                  return (
                    <li key={pid} className={classes.ratingItem}>
                      <UserAvatar
                        user={p}
                        className={classes.ratingAvatar}
                        imageClassName={classes.ratingAvatarImg}
                        fallbackClassName={classes.ratingAvatarFallback}
                        alt={name}
                      />
                      <span className={classes.ratingName}>{name}</span>
                      {done
                        ? <span className={classes.ratingDone}><Check size={14} /> Noté</span>
                        : <button className={classes.rateBtn} onClick={() => openRatingModal(p)}><Star size={14} /> Noter</button>
                      }
                    </li>
                  );
                })}
            </ul>
          </div>
        </div>
      )}

      {/* TOAST */}
      {toast && <div className={classes.toast}>{toast}</div>}

      {/* MODAL CLÔTURE */}
      {showCloseConfirm && (
        <div className={classes.modalOverlay} onClick={() => setShowCloseConfirm(false)}>
          <div className={classes.modal} onClick={(e) => e.stopPropagation()}>
            <div className={classes.modalHead}>
              <h3>Clôturer le projet ?</h3>
              <button type="button" className={classes.modalClose} onClick={() => setShowCloseConfirm(false)}><X size={16} /></button>
            </div>
            <p className={classes.modalSubtitle}>
              Cette action est irréversible. Le projet passera en statut "clôturé" et les membres pourront se noter mutuellement.
            </p>
            <div className={classes.modalFooter}>
              <button type="button" className={classes.modalCancel} onClick={() => setShowCloseConfirm(false)}>Annuler</button>
              <button type="button" className={classes.closeConfirmBtn} onClick={handleCloseProject} disabled={closeLoading}>
                {closeLoading ? "Clôture en cours…" : "Confirmer la clôture"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL NOTATION */}
      {showRatingModal && ratingTarget && (
        <div className={classes.modalOverlay} onClick={() => setShowRatingModal(false)}>
          <div className={classes.modal} onClick={(e) => e.stopPropagation()}>
            <div className={classes.modalHead}>
              <h3>Noter {ratingTarget.displayName || ratingTarget.firstName}</h3>
              <button type="button" className={classes.modalClose} onClick={() => setShowRatingModal(false)}><X size={16} /></button>
            </div>
            <div className={classes.starRow}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" className={`${classes.starBtn} ${ratingScore >= n ? classes.starActive : ""}`} onClick={() => setRatingScore(n)}>
                  <Star size={28} />
                </button>
              ))}
            </div>
            <textarea
              className={classes.modalTextarea}
              placeholder="Commentaire optionnel…"
              value={ratingComment}
              onChange={(e) => setRatingComment(e.target.value)}
              rows={3}
              maxLength={300}
            />
            <div className={classes.modalFooter}>
              <button type="button" className={classes.modalCancel} onClick={() => setShowRatingModal(false)}>Annuler</button>
              <button type="button" className={classes.modalSubmit} onClick={handleRate} disabled={ratingLoading || !ratingScore}>
                {ratingLoading ? "Envoi…" : "Envoyer la note"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL QUITTER */}
      {showLeaveModal && (
        <div className={classes.modalOverlay} onClick={() => setShowLeaveModal(false)}>
          <div className={classes.modal} onClick={(e) => e.stopPropagation()}>
            <div className={classes.modalHead}>
              <h3>Quitter le projet ?</h3>
              <button type="button" className={classes.modalClose} onClick={() => setShowLeaveModal(false)}>
                <X size={16} />
              </button>
            </div>
            <p className={classes.modalSubtitle}>
              Vous pourrez re-candidater plus tard. Un message sera affiché dans le chat du groupe.
            </p>
            <textarea
              className={classes.modalTextarea}
              placeholder="Message optionnel pour l'équipe…"
              value={leaveMessage}
              onChange={(e) => setLeaveMessage(e.target.value)}
              rows={3}
              maxLength={300}
            />
            <div className={classes.modalFooter}>
              <button type="button" className={classes.modalCancel} onClick={() => setShowLeaveModal(false)}>
                Annuler
              </button>
              <button type="button" className={classes.leaveConfirmBtn} onClick={handleLeave} disabled={leaveLoading}>
                {leaveLoading ? "Départ en cours…" : "Confirmer le départ"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL REJOINDRE */}
      {showJoinModal && (
        <div className={classes.modalOverlay} onClick={() => setShowJoinModal(false)}>
          <div className={classes.modal} onClick={(e) => e.stopPropagation()}>
            <div className={classes.modalHead}>
              <h3>{t("projectDetails.joinModalTitle", { title: project.title })}</h3>
              <button type="button" className={classes.modalClose} onClick={() => setShowJoinModal(false)}>
                <X size={16} />
              </button>
            </div>
            <p className={classes.modalSubtitle}>{t("projectDetails.joinModalSubtitle")}</p>
            <textarea
              className={classes.modalTextarea}
              placeholder={t("projectDetails.joinModalPlaceholder")}
              value={joinMessage}
              onChange={(e) => setJoinMessage(e.target.value)}
              rows={3}
              maxLength={500}
            />
            <div className={classes.modalFooter}>
              <button type="button" className={classes.modalCancel} onClick={() => setShowJoinModal(false)}>
                {t("projectDetails.cancel")}
              </button>
              <button type="button" className={classes.modalSubmit} onClick={handleJoin} disabled={joinLoading}>
                {joinLoading ? t("projectDetails.joinSending") : t("projectDetails.joinSubmit")}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
