import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { useSocket } from "../context/SocketContext";
import logoHive from "../img/logoHive.svg";
import classes from "./Header.module.css";
import { useTranslation } from "react-i18next";
import { MessageSquare, Bell, X, Check, Menu, Moon, Plus, LogOut } from "lucide-react";
import { api } from "../lib/api";

function formatTimeAgo(date) {
  const diff = (Date.now() - new Date(date)) / 1000;
  if (diff < 60) return "à l'instant";
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)} h`;
  return new Date(date).toLocaleDateString("fr-CH", { day: "2-digit", month: "short" });
}

export default function Header() {
  const { user, logout } = useAuth();
  const { t, i18n } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const socket = useSocket();
  const navigate = useNavigate();
  const bellRef = useRef(null);
  const notifPanelRef = useRef(null);

  const [unreadDMs, setUnreadDMs] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [showNotifs, setShowNotifs] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const unreadNotifs = notifications.filter((n) => !n.read).length;

  // Fetch unread DMs
  useEffect(() => {
    if (!user || user.role === "admin") return;
    const fetchDMs = async () => {
      try {
        const data = await api("/messages/unread");
        setUnreadDMs(data?.count || 0);
      } catch {}
    };
    fetchDMs();
    const interval = setInterval(fetchDMs, 30000);
    return () => clearInterval(interval);
  }, [user]);

  // Fetch notifications
  useEffect(() => {
    if (!user || user.role === "admin") return;
    api("/messages/notifications")
      .then((data) => setNotifications(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [user]);

  // Socket — notifications temps réel
  useEffect(() => {
    if (!socket) return;
    const handleNotif = (notif) => setNotifications((prev) => [notif, ...prev]);
    const handleReconnect = () => {
      api("/messages/notifications")
        .then((data) => setNotifications(Array.isArray(data) ? data : []))
        .catch(() => {});
    };
    socket.on("new_notification", handleNotif);
    socket.on("connect", handleReconnect);
    return () => {
      socket.off("new_notification", handleNotif);
      socket.off("connect", handleReconnect);
    };
  }, [socket]);

  // Fermer le panneau si clic extérieur — listener actif uniquement quand le panel est ouvert
  useEffect(() => {
    if (!showNotifs) return;
    const handler = (e) => {
      const insideBell = bellRef.current?.contains(e.target);
      const insidePanel = notifPanelRef.current?.contains(e.target);
      if (!insideBell && !insidePanel) setShowNotifs(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showNotifs]);

  const handleOpenNotifs = async () => {
    setShowNotifs((v) => !v);
    if (!showNotifs && unreadNotifs > 0) {
      try {
        await api("/messages/notifications/read", { method: "PUT" });
        setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      } catch {}
    }
  };

  const handleNotifClick = (notif) => {
    setShowNotifs(false);
    if (notif.link) navigate(notif.link);
  };

  const renderNotifAvatar = (n) => (
    <div className={classes.notifAvatar}>
      {n.meta?.senderAvatarUrl
        ? <img src={n.meta.senderAvatarUrl} alt="" className={classes.notifAvatarImg} />
        : <span className={classes.notifAvatarDefault}>{(n.meta?.senderName?.[0] || '?').toUpperCase()}</span>
      }
    </div>
  );

  const closeMenu = () => setMenuOpen(false);

  return (
    <>
    <header className={classes.header}>
      <nav className={classes.nav}>

        {/* LEFT — logo */}
        <div className={classes.navLeft}>
          <Link to={user?.role === "admin" ? "/manage-users" : "/"} className={classes.logoLink}>
            <span
              className={classes.logo}
              style={{"--logo-url": `url(${logoHive})`}}
              aria-hidden="true"
            />
            <span className={classes.logoName}>Hive</span>
          </Link>
        </div>

        {/* CENTER — nav links (desktop) */}
        <ul className={classes.navList}>
          {user?.role !== "admin" && (
            <>
              <li><Link to="/" className={classes.navLink}>{t("nav.home")}</Link></li>
              <li><Link to="/projects" className={classes.navLink}>{t("nav.projects")}</Link></li>
              <li><Link to="/profile" className={classes.navLink}>{t("nav.profile")}</Link></li>
              <li><Link to="/abonnement" className={classes.navLink}>{t("nav.plus")}</Link></li>
            </>
          )}
          {user?.role === "admin" && (
            <li><Link to="/manage-users" className={classes.navLink}>Dashboard Admin</Link></li>
          )}
        </ul>

        {/* RIGHT — icons + theme + lang + auth (desktop) */}
        <div className={classes.navRight}>

          {user && user.role !== "admin" && (
            <>
              {/* Messages */}
              <Link to="/messages" className={classes.iconBtn} title={t("nav.messages")}>
                <MessageSquare size={17} />
                {unreadDMs > 0 && (
                  <span className={classes.iconBadge}>
                    {unreadDMs > 9 ? "9+" : unreadDMs}
                  </span>
                )}
              </Link>

              {/* Notifications */}
              <div className={classes.notifWrapper} ref={bellRef}>
                <button
                  className={classes.iconBtn}
                  onClick={handleOpenNotifs}
                  title={t("header.notifications")}
                  aria-label={t("header.notifications")}
                >
                  <Bell size={17} />
                  {unreadNotifs > 0 && (
                    <span className={classes.iconBadge}>
                      {unreadNotifs > 9 ? "9+" : unreadNotifs}
                    </span>
                  )}
                </button>

                {showNotifs && (
                  <div ref={notifPanelRef} className={classes.notifPanel}>
                    <div className={classes.notifHead}>
                      <span>{t("header.notifications")}</span>
                      <button className={classes.notifClose} onClick={() => setShowNotifs(false)}>
                        <X size={14} />
                      </button>
                    </div>
                    {notifications.length === 0 ? (
                      <p className={classes.notifEmpty}>{t("header.noNotifications")}</p>
                    ) : (
                      <ul className={classes.notifList}>
                        {notifications.map((n) => (
                          <li key={n._id}>
                            <button
                              type="button"
                              className={`${classes.notifItem} ${!n.read ? classes.notifUnread : ""}`}
                              onClick={() => handleNotifClick(n)}
                            >
                              {!n.read && <div className={classes.notifDot}><span /></div>}
                              {renderNotifAvatar(n)}
                              <div className={classes.notifContent}>
                                <p className={classes.notifMsg}>{
                                  n.meta && n.type ? t(`notif.${n.type}`, {
                                    title: n.meta.projectTitle,
                                    name: n.meta.senderName || n.meta.raterName,
                                    score: n.meta.score,
                                    reason: n.meta.reason ? t('notif.kicked_reason', { reason: n.meta.reason }) : '',
                                  }) : n.message
                                }</p>
                                <span className={classes.notifTime}>{formatTimeAgo(n.createdAt)}</span>
                              </div>
                              {n.link && <Check size={13} className={classes.notifArrow} />}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Interrupteur « Mode sombre » : activé quand le thème sombre est actif */}
          <label className={classes.themeSwitch} title={t("nav.darkMode")}>
            <Moon size={14} className={classes.themeSwitchIcon} aria-hidden="true" />
            <input
              type="checkbox"
              role="switch"
              aria-label={t("nav.darkMode")}
              className={classes.themeSwitchInput}
              checked={theme === "dark"}
              onChange={toggleTheme}
            />
            <span className={classes.themeSwitchTrack} />
          </label>

          <div className={classes.langGroup}>
            <button
              className={`${classes.langBtn} ${i18n.language.startsWith("fr") ? classes.langBtnActive : ""}`}
              onClick={() => i18n.changeLanguage("fr")}
            >FR</button>
            <button
              className={`${classes.langBtn} ${!i18n.language.startsWith("fr") ? classes.langBtnActive : ""}`}
              onClick={() => i18n.changeLanguage("en")}
            >EN</button>
          </div>

          {user ? (
            <button onClick={logout} className={classes.logoutButton}>
              {t("nav.logout")}
            </button>
          ) : (
            <>
              <Link to="/login" className={classes.btnLogin}>{t("nav.login")}</Link>
              <Link to="/register" className={classes.btnRegister}>{t("nav.register")}</Link>
            </>
          )}
        </div>

        {/* MOBILE — cloche notifs + burger */}
        <div className={classes.mobileRight}>
          {user && user.role !== "admin" && (
            <div className={classes.notifWrapper}>
              <button className={classes.iconBtn} onClick={handleOpenNotifs} aria-label={t("header.notifications")}>
                <Bell size={17} />
                {unreadNotifs > 0 && <span className={classes.iconBadge}>{unreadNotifs > 9 ? "9+" : unreadNotifs}</span>}
              </button>
            </div>
          )}
          <button className={classes.burgerBtn} onClick={() => setMenuOpen(true)} aria-label="Menu">
            <Menu size={22} />
          </button>
        </div>

      </nav>

      {/* MOBILE DRAWER */}
      {menuOpen && (
        <div className={classes.drawerOverlay} onClick={closeMenu} />
      )}
      <div className={`${classes.drawer} ${menuOpen ? classes.drawerOpen : ""}`}>
        <div className={classes.drawerHead}>
          <Link to={user?.role === "admin" ? "/manage-users" : "/"} className={classes.logoLink} onClick={closeMenu}>
            <span
              className={classes.logo}
              style={{"--logo-url": `url(${logoHive})`}}
              aria-hidden="true"
            />
            <span className={classes.logoName}>Hive</span>
          </Link>
          <button className={classes.drawerClose} onClick={closeMenu}>
            <X size={20} />
          </button>
        </div>

        {/* Profil utilisateur ou boutons auth */}
        {user && user.role !== "admin" ? (
          <>
            <Link to="/profile" className={classes.drawerUserCard} onClick={closeMenu}>
              <div className={classes.drawerAvatar}>
                {user.avatarUrl
                  ? <img src={user.avatarUrl} alt="" className={classes.drawerAvatarImg} />
                  : <span>{(user.displayName || user.firstName || user.email || "?")[0].toUpperCase()}</span>
                }
              </div>
              <div className={classes.drawerUserInfo}>
                <span className={classes.drawerUserName}>
                  {user.displayName || [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email}
                </span>
                <span className={classes.drawerUserSub}>{t("nav.profile")}</span>
              </div>
            </Link>

            <div className={classes.drawerDivider} />

            <nav className={classes.drawerNav}>
              <Link to="/create-project" className={classes.drawerActionLink} onClick={closeMenu}>
                <Plus size={16} />
                {t("projects.create")}
              </Link>
              <Link to="/abonnement" className={classes.drawerLink} onClick={closeMenu}>
                {t("nav.plus")}
              </Link>
            </nav>
          </>
        ) : user?.role === "admin" ? (
          <nav className={classes.drawerNav}>
            <Link to="/manage-users" className={classes.drawerLink} onClick={closeMenu}>Dashboard Admin</Link>
          </nav>
        ) : (
          <div className={classes.drawerAuthBtns}>
            <Link to="/login" className={classes.drawerBtnLogin} onClick={closeMenu}>{t("nav.login")}</Link>
            <Link to="/register" className={classes.drawerBtnRegister} onClick={closeMenu}>{t("nav.register")}</Link>
          </div>
        )}

        <div className={classes.drawerDivider} />

        <div className={classes.drawerActions}>
          <div className={classes.drawerToggle} onClick={toggleTheme} style={{cursor:"pointer", justifyContent:"space-between"}}>
            <span>{t("nav.darkMode")}</span>
            <label className={classes.themeSwitch} onClick={e => e.stopPropagation()}>
              <input type="checkbox" role="switch" aria-label={t("nav.darkMode")} className={classes.themeSwitchInput} checked={theme === "dark"} onChange={toggleTheme} />
              <span className={classes.themeSwitchTrack} />
            </label>
          </div>
          <div className={classes.drawerToggle} style={{justifyContent:"space-between"}}>
            <span>{t("nav.language")}</span>
            <div className={classes.langGroup}>
              <button className={`${classes.langBtn} ${i18n.language.startsWith("fr") ? classes.langBtnActive : ""}`} onClick={() => i18n.changeLanguage("fr")}>FR</button>
              <button className={`${classes.langBtn} ${!i18n.language.startsWith("fr") ? classes.langBtnActive : ""}`} onClick={() => i18n.changeLanguage("en")}>EN</button>
            </div>
          </div>
        </div>

        {user && (
          <>
            <div className={classes.drawerDivider} />
            <div className={classes.drawerFooter}>
              <button onClick={() => { logout(); closeMenu(); }} className={classes.drawerLogout}>
                <LogOut size={15} />
                {t("nav.logout")}
              </button>
            </div>
          </>
        )}
      </div>

    </header>

      {/* Portal notifications mobile — rendu dans document.body, hors du sticky header */}
      {showNotifs && createPortal(
        <div ref={notifPanelRef} className={classes.mobileNotifFixed}>
          <div className={classes.notifHead}>
            <span>{t("header.notifications")}</span>
            <button className={classes.notifClose} onClick={() => setShowNotifs(false)}><X size={14} /></button>
          </div>
          {notifications.length === 0 ? (
            <p className={classes.notifEmpty}>{t("header.noNotifications")}</p>
          ) : (
            <ul className={classes.notifList}>
              {notifications.map((n) => (
                <li key={n._id}>
                  <button
                    type="button"
                    className={`${classes.notifItem} ${!n.read ? classes.notifUnread : ""}`}
                    onClick={() => handleNotifClick(n)}
                  >
                    <div className={classes.notifDot}>{!n.read && <span />}</div>
                    {renderNotifAvatar(n)}
                    <div className={classes.notifContent}>
                      <p className={classes.notifMsg}>{
                        n.meta && n.type ? t(`notif.${n.type}`, {
                          title: n.meta.projectTitle,
                          name: n.meta.senderName,
                          reason: n.meta.reason ? t('notif.kicked_reason', { reason: n.meta.reason }) : '',
                        }) : n.message
                      }</p>
                      <span className={classes.notifTime}>{formatTimeAgo(n.createdAt)}</span>
                    </div>
                    {n.link && <Check size={13} className={classes.notifArrow} />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>,
        document.body
      )}
    </>
  );
}
