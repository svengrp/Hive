import { Link } from "react-router-dom";
import { Users, MapPin } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { getProjectAccent } from "../lib/projectCover";
import ProjectCover from "./ProjectCover";
import { isBoosted } from "../lib/billing";
import classes from "./ProjectCard.module.css";
import { useTranslation } from "react-i18next";

/* Carte d'un projet (lien vers sa page). Gère :
   - l'image de couverture en bandeau (ou la couverture générée), le texte restant
     sur fond uni en dessous pour rester lisible
   - l'affichage du propriétaire ("Vous" si c'est l'utilisateur connecté)
   - le label d'âge selon la combinaison minAge/maxAge
   - la troncature de la description
   - le badge "Complet" quand plus aucune place n'est disponible
   - un accent de couleur par catégorie pour varier visuellement les cartes */
function ProjectCard({ project, index = 0 }) {
  const { user } = useAuth();
  const { t } = useTranslation();

  const availableSlots = project.maxParticipants - (project.participants?.length || 0);

  const truncateDescription = (text, maxLength = 100) => {
    if (!text) return "";
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + "...";
  };

  const currentUserId = user?._id || user?.id;
  const ownerId = project.ownerId?._id || project.ownerId;
  const isOwner = currentUserId && ownerId && currentUserId === ownerId;
  const ownerLabel = isOwner
    ? t("card.you")
    : project.ownerId?.displayName ||
      [project.ownerId?.firstName, project.ownerId?.lastName].filter(Boolean).join(" ");

  const ageLabel = (() => {
    if (project.minAge && project.maxAge) return `${project.minAge}-${project.maxAge} ans`;
    if (project.minAge) return `${project.minAge}+`;
    if (project.maxAge) return t("card.upTo", { max: project.maxAge });
    return t("card.allAges");
  })();

  const accent = getProjectAccent(project);

  return (
    <Link
      to={`/projects/${project._id}`}
      className={classes.projectCard}
      style={{
        "--card-accent": accent.text,
        "--card-accent-bg": accent.bg,
        "--card-accent-border": accent.border,
        "--i": index,
      }}
    >
      <ProjectCover project={project} size="thumb" className={classes.cover} />
      {isBoosted(project) && <span className={classes.boostedBadge}>{t("billing.boosted")}</span>}

      <div className={classes.body}>
      {/* HEADER */}
      <div>
        <h3 className={classes.projectTitle}>{project.title}</h3>
        {ownerLabel && (
          <p className={classes.projectDescription}>
            {t("card.by", { name: ownerLabel })}
          </p>
        )}
        <p className={classes.projectDescription}>
          {truncateDescription(project.description)}
        </p>
      </div>

      {/* TAGS */}
      {project.tags?.length > 0 && (
        <div className={classes.tagContainer}>
          {project.tags.slice(0, 3).map((tag, index) => (
            <span key={index} className={classes.tag}>{tag}</span>
          ))}
          {project.tags.length > 3 && (
            <span className={classes.tag}>+{project.tags.length - 3}</span>
          )}
        </div>
      )}

      {/* INFOS */}
      <div className={classes.projectInfo}>
        <div className={classes.infoItem}>
          <Users size={14} aria-hidden="true" />
          <span>
            {project.participants?.length || 0}/{project.maxParticipants} • {ageLabel}
          </span>
          {availableSlots === 0 && (
            <span className={classes.statusBadge}>{t("card.full")}</span>
          )}
        </div>

        {project.projectMeta?.city && (
          <div className={classes.infoItem}>
            <MapPin size={14} aria-hidden="true" />
            <span>{project.projectMeta.city}</span>
          </div>
        )}
      </div>
      </div>
    </Link>
  );
}

export default ProjectCard;
