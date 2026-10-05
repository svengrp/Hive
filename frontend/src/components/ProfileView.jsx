import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Camera, Upload } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import HiveRating from "./HiveRating";
import SubscriptionCard from "./SubscriptionCard";
import PrivacySettings from "./PrivacySettings";
import UserAvatar from "./UserAvatar";
import classes from "./ProfileView.module.css";
import ProjectCard from "./ProjectCard";

function getDisplayName(user) {
  return user.displayName || [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;
}

/* Page de profil de l'utilisateur connecté : affiche ses infos, ses projets, et un formulaire d'édition.
   Redirige vers /login si non authentifié. */
export default function Profile() {
  const { user, updateUser } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [myProject, setMyProject] = useState([]);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [blockedUsers, setBlockedUsers] = useState([]);
  const [receivedRatings, setReceivedRatings] = useState([]);

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    displayName: "",
    bio: "",
    phone: "",
    age: "",
    city: "",
    country: "",
    avatarUrl: "",
    languages: [],
    skills: [],
    education: [],
  });

  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const [newLanguage, setNewLanguage] = useState("");
  const [newSkill, setNewSkill] = useState("");
  const [newEducation, setNewEducation] = useState("");

  useEffect(() => {
    if (!user) {
      navigate("/login");
      return;
    }
    if (user.role === "admin") {
      navigate("/manage-users");
      return;
    }
    fetchProfile();
    // fetchProfile est recréée à chaque rendu : on ne recharge qu'au changement d'utilisateur.
  }, [user, navigate]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDeleteProject = async (projectId) => {
    if (!window.confirm(t("profile.deleteConfirm"))) return;
    try {
      await api(`/projects/${projectId}`, { method: "DELETE" });
      setMyProject((prev) => prev.filter((p) => p._id !== projectId));
    } catch (err) {
      setMessage({ type: "error", text: err.message });
    }
  };

  // Préférence : email quand un message arrive hors connexion (enregistrée immédiatement)
  const [notifSaving, setNotifSaving] = useState(false);
  const [notifError, setNotifError] = useState(false);
  const emailMessages = profile?.notificationPrefs?.emailMessages !== false;
  const toggleEmailMessages = async () => {
    const next = !emailMessages;
    setNotifError(false);
    setNotifSaving(true);
    setProfile((prev) => ({ ...prev, notificationPrefs: { ...prev?.notificationPrefs, emailMessages: next } }));
    try {
      await api("/user/notification-prefs", { method: "PUT", body: JSON.stringify({ emailMessages: next }) });
    } catch {
      setProfile((prev) => ({ ...prev, notificationPrefs: { ...prev?.notificationPrefs, emailMessages: !next } }));
      setNotifError(true);
    } finally {
      setNotifSaving(false);
    }
  };

  const fetchProfile = async () => {
    try {
      const data = await api("/auth/me");
      const currentUser = data.user;
      const myProject = await api("/projects/mine");
      api('/messages/blocked').then(setBlockedUsers).catch(() => {});
      api('/user/ratings').then(setReceivedRatings).catch(() => {});
      setMyProject(myProject);
      setProfile(currentUser);
      setForm({
        firstName: currentUser.firstName || "",
        lastName: currentUser.lastName || "",
        displayName: currentUser.displayName || "",
        bio: currentUser.bio || "",
        phone: currentUser.phone || "",
        age: currentUser.age || "",
        city: currentUser.address?.city || "",
        country: currentUser.address?.country || "",
        avatarUrl: currentUser.avatarUrl || "",
        languages: currentUser.languages || [],
        skills: currentUser.skills || [],
        education: currentUser.education || [],
      });
    } catch (err) {
      console.error(err);
      setMessage({ type: "error", text: t("profile.loadError") });
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    setForm((current) => ({ ...current, [e.target.name]: e.target.value }));
  };

  const handlePasswordChange = (e) => {
    setPasswordForm((current) => ({ ...current, [e.target.name]: e.target.value }));
  };

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setForm((current) => ({ ...current, avatarUrl: reader.result }));
      }
    };
    reader.readAsDataURL(file);
  };

  const addItem = (field, value, resetFn) => {
    if (!value.trim()) return;

    const trimmedValue = value.trim();
    if (form[field].includes(trimmedValue)) {
      resetFn("");
      return;
    }

    setForm((current) => ({ ...current, [field]: [...current[field], trimmedValue] }));
    resetFn("");
  };

  const removeItem = (field, index) => {
    const updated = [...form[field]];
    updated.splice(index, 1);
    setForm((current) => ({ ...current, [field]: updated }));
  };

  const handleUnblock = async (userId) => {
    await api(`/messages/block/${userId}`, { method: 'DELETE' });
    setBlockedUsers(prev => prev.filter(u => u._id.toString() !== userId.toString()));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage({ type: "", text: "" });

    try {
      const updatedProfile = await api("/user/profile", {
        method: "PUT",
        body: JSON.stringify({
          firstName: form.firstName,
          lastName: form.lastName,
          displayName: form.displayName,
          age: form.age ? Number(form.age) : null,
          phone: form.phone,
          bio: form.bio,
          languages: form.languages,
          skills: form.skills,
          education: form.education,
          avatarUrl: form.avatarUrl,
          address: { city: form.city, country: form.country },
        }),
      });

      if (passwordForm.newPassword || passwordForm.confirmPassword || passwordForm.currentPassword) {
        if (!passwordForm.currentPassword) {
          throw new Error(t("profile.currentPasswordRequired"));
        }
        if (passwordForm.newPassword !== passwordForm.confirmPassword) {
          throw new Error(t("profile.passwordMismatch"));
        }

        await api("/user/password", {
          method: "PUT",
          body: JSON.stringify({
            currentPassword: passwordForm.currentPassword,
            newPassword: passwordForm.newPassword,
          }),
        });
      }

      const mergedProfile = { ...updatedProfile, email: updatedProfile.email || profile.email };
      setProfile(mergedProfile);
      if (updateUser) {
        await updateUser(mergedProfile);
      } else {
        localStorage.setItem("user", JSON.stringify(mergedProfile));
      }
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      setMessage({ type: "success", text: t("profile.saveSuccess") });
    } catch (err) {
      setMessage({ type: "error", text: err.message });
    }
  };

  if (loading || !profile) return null;

  return (
    <div className={classes.profilePage}>
      <div className={classes.profileHeaderWrapper}>
        <div className={classes.profileHeader}>
          <div className={classes.avatarStack}>
            <UserAvatar
              user={{ ...profile, avatarUrl: form.avatarUrl || profile.avatarUrl }}
              className={classes.avatar}
              imageClassName={classes.avatarImage}
              fallbackClassName={classes.avatarFallback}
              alt={`Avatar de ${getDisplayName(profile)}`}
            />
          </div>

          <div className={classes.profileInfo}>
            <h1>{getDisplayName(profile)}</h1>
            <div className={classes.profileEmail}>{profile.email}</div>
            {profile.bio && <div className={classes.profileBio}>{profile.bio}</div>}
          </div>

          <div className={classes.reputation}>
            <HiveRating reputation={profile.reputation} />
          </div>
        </div>
      </div>

      <div className={classes.profileContainer}>
        <h2 className={classes.sectionTitle}>{t("profile.myProjects")}</h2>
      </div>
      <div className={classes.myProjectsSection}>
        {myProject.length === 0 ? (
          <p className={classes.emptyProjects}>{t("profile.noProjects")}</p>
        ) : (
          <>
            {(() => {
              const active = myProject.filter((p) => ["open", "draft"].includes(p.status));
              const finished = myProject.filter((p) => ["closed", "archived"].includes(p.status));
              return (
                <>
                  {active.length > 0 && (
                    <>
                      <p className={classes.projectGroupLabel}>{t("profile.activeProjects")}</p>
                      <div className={classes.myProjectsGrid}>
                        {active.map((project) => (
                          <div key={project._id} className={classes.projectCardWrap}>
                            <ProjectCard project={project} />
                            <div className={classes.projectActions}>
                              <button
                                type="button"
                                className={classes.projectEditButton}
                                onClick={() => navigate(`/projects/${project._id}/edit`)}
                              >
                                {t("profile.edit")}
                              </button>
                              <button
                                type="button"
                                className={classes.projectDeleteButton}
                                onClick={() => handleDeleteProject(project._id)}
                              >
                                {t("profile.delete")}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                  {finished.length > 0 && (
                    <>
                      <p className={classes.projectGroupLabel}>{t("profile.finishedProjects")}</p>
                      <div className={classes.myProjectsGrid}>
                        {finished.map((project) => (
                          <div key={project._id} className={classes.projectCardWrap}>
                            <ProjectCard project={project} />
                            <div className={classes.projectActions}>
                              <button
                                type="button"
                                className={classes.projectEditButton}
                                onClick={() => navigate(`/projects/${project._id}/edit`)}
                              >
                                {t("profile.edit")}
                              </button>
                              <button
                                type="button"
                                className={classes.projectDeleteButton}
                                onClick={() => handleDeleteProject(project._id)}
                              >
                                {t("profile.delete")}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </>
              );
            })()}
          </>
        )}
      </div>

      <div className={classes.profileContainer}>
        <section className={classes.section}>
          <h2 className={classes.sectionTitle}>{t("profile.editTitle")}</h2>

          {message.text && (
            <div className={message.type === "success" ? classes.messageSuccess : classes.messageError}>
              {message.text}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className={classes.formGrid}>
              <div className={classes.card}>
                <h3 className={classes.cardTitle}>{t("profile.personalInfo")}</h3>

                <div className={classes.avatarEditor}>
                  <UserAvatar
                    user={{ ...profile, avatarUrl: form.avatarUrl || profile.avatarUrl }}
                    className={classes.avatarEditorPreview}
                    imageClassName={classes.avatarEditorImage}
                    fallbackClassName={classes.avatarEditorFallback}
                    alt="Aperçu de la photo de profil"
                  />

                  <div className={classes.avatarEditorFields}>
                    <label className={classes.uploadButton} htmlFor="avatar-upload">
                      <Upload size={16} />
                      {t("profile.choosePhoto")}
                    </label>
                    <input
                      id="avatar-upload"
                      type="file"
                      accept="image/*"
                      className={classes.hiddenInput}
                      onChange={handleAvatarUpload}
                    />

                    <div className={classes.fieldGroup}>
                      <label className={classes.label} htmlFor="avatar-url">{t("profile.pasteUrl")}</label>
                      <div className={classes.inputIconWrap}>
                        <Camera size={16} className={classes.inputIcon} />
                        <input
                          id="avatar-url"
                          className={classes.input}
                          name="avatarUrl"
                          value={form.avatarUrl}
                          onChange={handleChange}
                          placeholder="https://..."
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className={classes.nameRow}>
                  <div className={classes.fieldGroup}>
                    <label className={classes.label}>{t("profile.firstName")}</label>
                    <input className={classes.input} name="firstName" value={form.firstName} onChange={handleChange} />
                  </div>
                  <div className={classes.fieldGroup}>
                    <label className={classes.label}>{t("profile.lastName")}</label>
                    <input className={classes.input} name="lastName" value={form.lastName} onChange={handleChange} />
                  </div>
                </div>

                <div className={classes.fieldGroup}>
                  <label className={classes.label}>{t("profile.displayName")}</label>
                  <input className={classes.input} name="displayName" value={form.displayName} onChange={handleChange} />
                </div>

                <div className={classes.fieldGroup}>
                  <label className={classes.label}>{t("profile.age")}</label>
                  <input type="number" className={classes.input} name="age" value={form.age} onChange={handleChange} />
                </div>

                <div className={classes.fieldGroup}>
                  <label className={classes.label}>{t("profile.bio")}</label>
                  <textarea className={classes.textarea} rows="3" name="bio" value={form.bio} onChange={handleChange} />
                </div>
              </div>

              <div className={classes.card}>
                <h3 className={classes.cardTitle}>{t("profile.skillsLanguages")}</h3>

                <div className={classes.fieldGroup}>
                  <label className={classes.label}>{t("profile.languages")}</label>
                  <div className={classes.tagList}>
                    {form.languages.map((lang, i) => (
                      <div key={i} className={classes.tag}>
                        {lang}
                        <span onClick={() => removeItem("languages", i)} className={classes.removeTag}>✕</span>
                      </div>
                    ))}
                  </div>
                  <div className={classes.addField}>
                    <input className={classes.input} value={newLanguage} onChange={(e) => setNewLanguage(e.target.value)} placeholder={t("profile.addLanguage")}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addItem("languages", newLanguage, setNewLanguage); } }} />
                    <button type="button" className={classes.addBtn} onClick={() => addItem("languages", newLanguage, setNewLanguage)}>+</button>
                  </div>
                </div>

                <div className={classes.fieldGroup}>
                  <label className={classes.label}>{t("profile.skills")}</label>
                  <div className={classes.tagList}>
                    {form.skills.map((skill, i) => (
                      <div key={i} className={classes.tag}>
                        {skill}
                        <span onClick={() => removeItem("skills", i)} className={classes.removeTag}>✕</span>
                      </div>
                    ))}
                  </div>
                  <div className={classes.addField}>
                    <input className={classes.input} value={newSkill} onChange={(e) => setNewSkill(e.target.value)} placeholder={t("profile.addSkill")}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addItem("skills", newSkill, setNewSkill); } }} />
                    <button type="button" className={classes.addBtn} onClick={() => addItem("skills", newSkill, setNewSkill)}>+</button>
                  </div>
                </div>

                <div className={classes.fieldGroup}>
                  <label className={classes.label}>{t("profile.education")}</label>
                  <div className={classes.tagList}>
                    {form.education.map((edu, i) => (
                      <div key={i} className={classes.tag}>
                        {edu}
                        <span onClick={() => removeItem("education", i)} className={classes.removeTag}>✕</span>
                      </div>
                    ))}
                  </div>
                  <div className={classes.addField}>
                    <input className={classes.input} value={newEducation} onChange={(e) => setNewEducation(e.target.value)} placeholder={t("profile.addEducation")}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addItem("education", newEducation, setNewEducation); } }} />
                    <button type="button" className={classes.addBtn} onClick={() => addItem("education", newEducation, setNewEducation)}>+</button>
                  </div>
                </div>
              </div>

              <div className={classes.card}>
                <h3 className={classes.cardTitle}>{t("profile.location")}</h3>

                <div className={classes.fieldGroup}>
                  <label className={classes.label}>{t("profile.city")}</label>
                  <input className={classes.input} name="city" value={form.city} onChange={handleChange} />
                </div>

                <div className={classes.fieldGroup}>
                  <label className={classes.label}>{t("profile.country")}</label>
                  <input className={classes.input} name="country" value={form.country} onChange={handleChange} />
                </div>
              </div>

              <div className={classes.card}>
                <h3 className={classes.cardTitle}>{t("profile.changePassword")}</h3>

                <div className={classes.passwordGrid}>
                  <div className={classes.fieldGroup}>
                    <label className={classes.label}>{t("profile.currentPassword")}</label>
                    <input className={classes.input} type="password" name="currentPassword" value={passwordForm.currentPassword} onChange={handlePasswordChange} placeholder="••••••••" />
                  </div>
                  <div className={classes.fieldGroup}>
                    <label className={classes.label}>{t("profile.newPassword")}</label>
                    <input className={classes.input} type="password" name="newPassword" value={passwordForm.newPassword} onChange={handlePasswordChange} placeholder="••••••••" />
                  </div>
                  <div className={classes.fieldGroup}>
                    <label className={classes.label}>{t("profile.confirmPassword")}</label>
                    <input className={classes.input} type="password" name="confirmPassword" value={passwordForm.confirmPassword} onChange={handlePasswordChange} placeholder="••••••••" />
                  </div>
                </div>
              </div>
            </div>

            <div style={{ marginTop: "32px", textAlign: "right" }}>
              <button className={classes.primaryBtn}>{t("profile.save")}</button>
            </div>
          </form>
        </section>
      </div>
      <div className={classes.profileContainer}>
        <section className={classes.section}>
          <h2 className={classes.sectionTitle}>{t("billing.profileTitle")}</h2>
          <SubscriptionCard />
        </section>
        <section className={classes.section}>
          <h2 className={classes.sectionTitle}>{t("profile.notifTitle")}</h2>
          <label className={classes.switchRow}>
            <span className={classes.switchText}>
              <span className={classes.switchLabel}>{t("profile.emailMessages")}</span>
              <span className={classes.switchHint}>{t("profile.emailMessagesHint")}</span>
            </span>
            <input
              type="checkbox"
              role="switch"
              className={classes.switch}
              checked={emailMessages}
              disabled={notifSaving || !profile}
              onChange={toggleEmailMessages}
            />
          </label>
          {notifError && <p className={classes.switchError} role="alert">{t("profile.notifSaveError")}</p>}
        </section>
        <section className={classes.section}>
          <h2 className={classes.sectionTitle}>{t("privacy.title")}</h2>
          <PrivacySettings />
        </section>
      </div>

      {blockedUsers.length > 0 && (
        <div className={classes.profileContainer}>
          <section className={classes.section}>
            <h2 className={classes.sectionTitle}>Utilisateurs bloqués</h2>
            <ul className={classes.blockedList}>
              {blockedUsers.map(u => {
                const name = u.displayName || [u.firstName, u.lastName].filter(Boolean).join(" ") || "Utilisateur";
                return (
                  <li key={u._id} className={classes.blockedItem}>
                    <UserAvatar
                      user={u}
                      className={classes.blockedAvatar}
                      imageClassName={classes.blockedAvatarImg}
                      fallbackClassName={classes.blockedAvatarFallback}
                      alt={name}
                    />
                    <span className={classes.blockedName}>{name}</span>
                    <button className={classes.unblockBtn} onClick={() => handleUnblock(u._id)}>
                      Débloquer
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      )}

      <div className={classes.profileContainer}>
        <section className={classes.section}>
          <h2 className={classes.sectionTitle}>{t("profile.ratingHistory")}</h2>
          {receivedRatings.length === 0 ? (
            <p className={classes.emptyText}>{t("profile.noRatings")}</p>
          ) : (
            <ul className={classes.ratingHistoryList}>
              {receivedRatings.map((r) => {
                const raterName = r.raterId?.displayName ||
                  [r.raterId?.firstName, r.raterId?.lastName].filter(Boolean).join(" ") ||
                  "Utilisateur";
                return (
                  <li key={r._id} className={classes.ratingHistoryItem}>
                    <div className={classes.ratingHistoryHeader}>
                      <UserAvatar
                        user={r.raterId}
                        className={classes.ratingHistoryAvatar}
                        imageClassName={classes.ratingHistoryAvatarImg}
                        fallbackClassName={classes.ratingHistoryAvatarFallback}
                        alt={raterName}
                      />
                      <div className={classes.ratingHistoryMeta}>
                        <span className={classes.ratingHistoryName}>{t("profile.ratingBy", { name: raterName })}</span>
                        {r.projectId?.title && (
                          <span className={classes.ratingHistoryProject}>{t("profile.ratingFor", { title: r.projectId.title })}</span>
                        )}
                      </div>
                      <div className={classes.ratingHistoryStars}>
                        {[1,2,3,4,5].map((n) => (
                          <span key={n} className={n <= r.score ? classes.starFilled : classes.starEmpty}>★</span>
                        ))}
                      </div>
                    </div>
                    {r.comment && <p className={classes.ratingHistoryComment}>"{r.comment}"</p>}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

    </div>
  );
}
