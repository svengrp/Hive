import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { MapPin, Languages, Wrench, Calendar, ArrowLeft, MessageSquare } from "lucide-react";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import UserAvatar from "./UserAvatar";
import HiveRating from "./HiveRating";
import ProjectCard from "./ProjectCard";
import { useSeo } from "../lib/seo";
import classes from "./PublicProfileView.module.css";

function getDisplayName(profile, defaultName) {
  return (
    profile?.displayName ||
    [profile?.firstName, profile?.lastName].filter(Boolean).join(" ") ||
    defaultName
  );
}

function formatJoinDate(date) {
  if (!date) return null;
  return new Date(date).toLocaleDateString("fr-CH", {
    month: "long",
    year: "numeric",
  });
}

/* Vue publique du profil d'un utilisateur (lecture seule), accessible via /user/:id.
   Affiche uniquement les champs non-sensibles retournés par sanitizePublicProfile côté API. */
export default function PublicProfileView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // Profils de personnes : jamais indexés (vie privée), nginx ajoute aussi X-Robots-Tag
  useSeo({ title: getDisplayName(profile, ""), noindex: true });

  useEffect(() => {
    Promise.all([
      api(`/user/${id}`),
      api(`/user/${id}/projects`),
    ])
      .then(([profileData, projectsData]) => {
        setProfile(profileData);
        setProjects(projectsData);
      })
      .catch((err) => setError(err.message || t("publicProfile.notFound")))
      .finally(() => setLoading(false));
  }, [id, t]);

  if (loading) {
    return <div className={classes.center}>{t("publicProfile.loading")}</div>;
  }

  if (error || !profile) {
    return (
      <div className={classes.center}>
        <p>{error || t("publicProfile.notFound")}</p>
        <button type="button" className={classes.backButton} onClick={() => navigate(-1)}>
          {t("publicProfile.back")}
        </button>
      </div>
    );
  }

  const location = [profile.address?.city, profile.address?.country].filter(Boolean).join(", ");
  const joinedAt = formatJoinDate(profile.createdAt);
  const displayName = getDisplayName(profile, t("publicProfile.defaultName"));

  return (
    <div className={classes.page}>
      <div className={classes.topBar}>
        <button type="button" className={classes.backButton} onClick={() => navigate(-1)}>
          <ArrowLeft size={16} />
          {t("publicProfile.back")}
        </button>
      </div>

      <section className={classes.hero}>
        <UserAvatar
          user={profile}
          className={classes.avatar}
          imageClassName={classes.avatarImage}
          fallbackClassName={classes.avatarFallback}
          alt={`Avatar de ${displayName}`}
        />

        <div className={classes.heroInfo}>
          <h1>{displayName}</h1>
          {profile.bio && <p>{profile.bio}</p>}
          <div className={classes.ratingRow}>
            <HiveRating reputation={profile.reputation} />
          </div>
          <div className={classes.metaList}>
            {location && (
              <span>
                <MapPin size={14} />
                {location}
              </span>
            )}
            {joinedAt && (
              <span>
                <Calendar size={14} />
                {t("publicProfile.joinedAt", { date: joinedAt })}
              </span>
            )}
          </div>
          {user && user._id !== id && user.id !== id && (
            <button
              type="button"
              className={classes.messageBtn}
              onClick={() => navigate(`/messages?with=${id}`)}
            >
              <MessageSquare size={15} />
              {t("publicProfile.sendMessage")}
            </button>
          )}
        </div>
      </section>

      <section className={classes.grid}>
        <div className={classes.card}>
          <h2>{t("publicProfile.skills")}</h2>
          {profile.skills?.length ? (
            <div className={classes.tags}>
              {profile.skills.map((skill) => (
                <span key={skill} className={classes.tag}>
                  <Wrench size={12} />
                  {skill}
                </span>
              ))}
            </div>
          ) : (
            <p className={classes.empty}>{t("publicProfile.noSkills")}</p>
          )}
        </div>

        <div className={classes.card}>
          <h2>{t("publicProfile.languages")}</h2>
          {profile.languages?.length ? (
            <div className={classes.tags}>
              {profile.languages.map((language) => (
                <span key={language} className={classes.tag}>
                  <Languages size={12} />
                  {language}
                </span>
              ))}
            </div>
          ) : (
            <p className={classes.empty}>{t("publicProfile.noLanguages")}</p>
          )}
        </div>
      </section>

      <section className={classes.projectsSection}>
        <h2 className={classes.projectsSectionTitle}>{t("publicProfile.projects")}</h2>
        {projects.length === 0 ? (
          <p className={classes.empty}>{t("publicProfile.noProjects")}</p>
        ) : (
          <>
            {(() => {
              const active = projects.filter((p) => ["open", "draft"].includes(p.status));
              const finished = projects.filter((p) => ["closed", "archived"].includes(p.status));
              return (
                <>
                  {active.length > 0 && (
                    <>
                      <p className={classes.projectGroupLabel}>{t("publicProfile.activeProjects")}</p>
                      <div className={classes.projectsGrid}>
                        {active.map((project) => (
                          <ProjectCard key={project._id} project={project} />
                        ))}
                      </div>
                    </>
                  )}
                  {finished.length > 0 && (
                    <>
                      <p className={classes.projectGroupLabel}>{t("publicProfile.finishedProjects")}</p>
                      <div className={classes.projectsGrid}>
                        {finished.map((project) => (
                          <ProjectCard key={project._id} project={project} />
                        ))}
                      </div>
                    </>
                  )}
                </>
              );
            })()}
          </>
        )}
      </section>
    </div>
  );
}
