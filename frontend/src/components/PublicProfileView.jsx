import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { MapPin, Calendar, ArrowLeft, MessageSquare, Globe, Linkedin, Github, PencilLine } from "lucide-react";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import UserAvatar from "./UserAvatar";
import HiveRating from "./HiveRating";
import PlusBadge from "./PlusBadge";
import ProjectCard from "./ProjectCard";
import { cleanInterests } from "../lib/interests";
import { formatPeriod, linkLabel, orgBadge, sortTimeline } from "../lib/cv";
import { useSeo } from "../lib/seo";
import classes from "./PublicProfileView.module.css";

function getDisplayName(profile, defaultName) {
  return (
    profile?.displayName ||
    [profile?.firstName, profile?.lastName].filter(Boolean).join(" ") ||
    defaultName
  );
}

function formatJoinDate(date, lang) {
  if (!date) return null;
  return new Date(date).toLocaleDateString(lang === "en" ? "en-GB" : "fr-CH", { month: "long", year: "numeric" });
}

// Bio laissée par défaut à l'inscription : rien à montrer
const DEFAULT_BIO = "Nouvel utilisateur Hive !";

/* Une ligne du parcours : pastille de l'organisation, intitulé, dates ; la description s'ouvre au clic. */
function TimelineItem({ title, subtitle, entry, location, org }) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const badge = orgBadge(org || title);
  const period = formatPeriod(entry, t, i18n.language);
  const long = (entry.description || "").length > 220 || (entry.description || "").split("\n").length > 3;
  return (
    <li className={classes.item}>
      <span className={classes.badge} style={{ "--badge": badge.color }} aria-hidden="true">
        {badge.letter}
      </span>
      <div className={classes.itemBody}>
        <h3 className={classes.itemTitle}>{title}</h3>
        {subtitle && <p className={classes.itemSubtitle}>{subtitle}</p>}
        {(period || location) && <p className={classes.itemMeta}>{[period, location].filter(Boolean).join(" · ")}</p>}
        {entry.description && (
          <>
            <p className={`${classes.itemDesc} ${long && !open ? classes.clamped : ""}`}>{entry.description}</p>
            {long && (
              <button type="button" className={classes.moreBtn} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
                {open ? t("cv.showLess") : t("cv.showMore")}
              </button>
            )}
          </>
        )}
      </div>
    </li>
  );
}

const LINKS = [
  { key: "website", Icon: Globe },
  { key: "linkedin", Icon: Linkedin },
  { key: "github", Icon: Github },
];

/* Vue publique du profil d'un utilisateur (lecture seule), accessible via /user/:id, présentée comme un CV.
   Affiche uniquement les champs non-sensibles retournés par sanitizePublicProfile côté API. */
export default function PublicProfileView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // Profils de personnes : jamais indexés (vie privée), nginx ajoute aussi X-Robots-Tag
  useSeo({ title: getDisplayName(profile, ""), noindex: true });

  useEffect(() => {
    Promise.all([api(`/user/${id}`), api(`/user/${id}/projects`)])
      .then(([profileData, projectsData]) => {
        setProfile(profileData);
        setProjects(Array.isArray(projectsData) ? projectsData : []);
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

  const isMe = !!user && (user._id === id || user.id === id);
  const location = [profile.address?.city, profile.address?.country].filter(Boolean).join(", ");
  const joinedAt = formatJoinDate(profile.createdAt, i18n.language);
  const displayName = getDisplayName(profile, t("publicProfile.defaultName"));
  const bio = profile.bio && profile.bio !== DEFAULT_BIO ? profile.bio : "";
  const experiences = sortTimeline(profile.experiences);
  // Anciennes formations (simples lignes de texte) tant que la personne n'a pas rempli le nouveau parcours
  const formations = profile.formations?.length
    ? sortTimeline(profile.formations)
    : (profile.education || []).map((school) => ({ school }));
  const interests = cleanInterests(profile.interests);
  const links = LINKS.filter(({ key }) => profile.links?.[key]);
  const active = projects.filter((p) => ["open", "draft"].includes(p.status));
  const finished = projects.filter((p) => ["closed", "archived"].includes(p.status));
  const hasSide = profile.skills?.length || profile.languages?.length || interests.length;
  const emptyCv = !bio && !experiences.length && !formations.length;

  return (
    <div className={classes.page}>
      <div className={classes.wrap}>
        <button type="button" className={classes.backButton} onClick={() => navigate(-1)}>
          <ArrowLeft size={16} />
          {t("publicProfile.back")}
        </button>

        <header className={classes.header}>
          <div className={classes.band} aria-hidden="true" />
          <div className={classes.headerBody}>
            <UserAvatar
              user={profile}
              className={classes.avatar}
              imageClassName={classes.avatarImage}
              fallbackClassName={classes.avatarFallback}
              alt={`Avatar de ${displayName}`}
            />
            <div className={classes.actions}>
              {isMe ? (
                <Link to="/profile" className={classes.secondaryBtn}>
                  <PencilLine size={15} />
                  {t("cv.editProfile")}
                </Link>
              ) : (
                user && (
                  <button type="button" className={classes.primaryBtn} onClick={() => navigate(`/messages?with=${id}`)}>
                    <MessageSquare size={15} />
                    {t("publicProfile.sendMessage")}
                  </button>
                )
              )}
            </div>

            <h1 className={classes.name}>
              {displayName}
              {profile.plan === "plus" && <PlusBadge size="md" />}
            </h1>
            {profile.headline && <p className={classes.headline}>{profile.headline}</p>}

            <div className={classes.meta}>
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
              {profile.openToProjects && <span className={classes.openPill}>{t("cv.openToProjects")}</span>}
            </div>

            <div className={classes.subRow}>
              <HiveRating reputation={profile.reputation} />
              {links.length > 0 && (
                <ul className={classes.links} aria-label={t("cv.links")}>
                  {links.map(({ key, Icon }) => (
                    <li key={key}>
                      <a href={profile.links[key]} target="_blank" rel="noopener noreferrer nofollow" title={t(`cv.${key}`)}>
                        <Icon size={15} />
                        <span>{key === "website" ? linkLabel(profile.links[key]) : t(`cv.${key}`)}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </header>

        <div className={`${classes.layout} ${hasSide ? "" : classes.layoutSingle}`}>
          <main className={classes.main}>
            {bio && (
              <section className={classes.card}>
                <h2>{t("cv.about")}</h2>
                <p className={classes.about}>{bio}</p>
              </section>
            )}

            {experiences.length > 0 && (
              <section className={classes.card}>
                <h2>{t("cv.experience")}</h2>
                <ul className={classes.timeline}>
                  {experiences.map((e, i) => (
                    <TimelineItem key={e._id || i} title={e.title} subtitle={e.organization} org={e.organization} location={e.location} entry={e} />
                  ))}
                </ul>
              </section>
            )}

            {formations.length > 0 && (
              <section className={classes.card}>
                <h2>{t("cv.formations")}</h2>
                <ul className={classes.timeline}>
                  {formations.map((f, i) => (
                    <TimelineItem key={f._id || i} title={f.school} subtitle={f.degree} org={f.school} entry={f} />
                  ))}
                </ul>
              </section>
            )}

            {emptyCv && isMe && (
              <section className={`${classes.card} ${classes.emptyCard}`}>
                <p>{t("cv.emptyOwn")}</p>
                <Link to="/profile" className={classes.secondaryBtn}>
                  <PencilLine size={15} />
                  {t("cv.editProfile")}
                </Link>
              </section>
            )}

            <section className={classes.card}>
              <h2>{t("cv.hiveProjects")}</h2>
              {projects.length === 0 ? (
                <p className={classes.empty}>{t("publicProfile.noProjects")}</p>
              ) : (
                <>
                  {active.length > 0 && (
                    <>
                      {finished.length > 0 && <p className={classes.groupLabel}>{t("publicProfile.activeProjects")}</p>}
                      <div className={classes.projectsGrid}>
                        {active.map((project) => (
                          <ProjectCard key={project._id} project={project} />
                        ))}
                      </div>
                    </>
                  )}
                  {finished.length > 0 && (
                    <>
                      <p className={classes.groupLabel}>{t("publicProfile.finishedProjects")}</p>
                      <div className={classes.projectsGrid}>
                        {finished.map((project) => (
                          <ProjectCard key={project._id} project={project} />
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}
            </section>
          </main>

          {hasSide ? (
            <aside className={classes.side}>
              {profile.skills?.length > 0 && (
                <section className={classes.card}>
                  <h2>{t("cv.skills")}</h2>
                  <ul className={classes.chips}>
                    {profile.skills.map((skill) => (
                      <li key={skill} className={classes.chip}>{skill}</li>
                    ))}
                  </ul>
                </section>
              )}
              {profile.languages?.length > 0 && (
                <section className={classes.card}>
                  <h2>{t("cv.languages")}</h2>
                  <ul className={classes.chips}>
                    {profile.languages.map((language) => (
                      <li key={language} className={classes.chip}>{language}</li>
                    ))}
                  </ul>
                </section>
              )}
              {interests.length > 0 && (
                <section className={classes.card}>
                  <h2>{t("cv.interests")}</h2>
                  <ul className={classes.chips}>
                    {interests.map((key) => (
                      <li key={key} className={`${classes.chip} ${classes.chipSoft}`}>{t(`interests.${key}`)}</li>
                    ))}
                  </ul>
                </section>
              )}
            </aside>
          ) : null}
        </div>
      </div>
    </div>
  );
}
