import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { Home, Layers, LogIn, MessageSquare, User } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import classes from "./BottomNav.module.css";

export default function BottomNav() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [unreadDMs, setUnreadDMs] = useState(0);

  useEffect(() => {
    if (!user || user.role === "admin") return;
    const fetch = () => api("/messages/unread").then((d) => setUnreadDMs(d?.count || 0)).catch(() => {});
    fetch();
    const id = setInterval(fetch, 30000);
    return () => clearInterval(id);
  }, [user]);

  if (user?.role === "admin") return null;

  return (
    <nav className={classes.nav}>
      <NavLink to="/" end className={({ isActive }) => `${classes.item} ${isActive ? classes.active : ""}`}>
        <Home size={21} />
        <span>{t("nav.home")}</span>
      </NavLink>

      <NavLink to="/projects" className={({ isActive }) => `${classes.item} ${isActive ? classes.active : ""}`}>
        <Layers size={21} />
        <span>{t("nav.projects")}</span>
      </NavLink>

      {!user && (
        <NavLink to="/login" className={({ isActive }) => `${classes.item} ${isActive ? classes.active : ""}`}>
          <LogIn size={21} />
          <span>{t("nav.login")}</span>
        </NavLink>
      )}

      {user && (
        <>
          <NavLink to="/messages" className={({ isActive }) => `${classes.item} ${isActive ? classes.active : ""}`}>
            <span className={classes.iconWrap}>
              <MessageSquare size={21} />
              {unreadDMs > 0 && <span className={classes.badge}>{unreadDMs > 9 ? "9+" : unreadDMs}</span>}
            </span>
            <span>{t("nav.messages")}</span>
          </NavLink>

          <NavLink to="/profile" className={({ isActive }) => `${classes.item} ${isActive ? classes.active : ""}`}>
            <User size={21} />
            <span>{t("nav.profile")}</span>
          </NavLink>
        </>
      )}
    </nav>
  );
}
