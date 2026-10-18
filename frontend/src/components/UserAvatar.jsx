import React, { useEffect, useState } from "react";
import { avatarSrc } from "../lib/avatar";

/* Affiche la photo de profil si disponible, sinon les initiales de l'utilisateur en fallback.
   Le state imageFailed se réinitialise à chaque changement d'URL pour forcer un re-essai. */
function getInitials(user = {}) {
  const first = user.firstName?.[0] || user.displayName?.[0] || user.email?.[0] || "?";
  const last = user.lastName?.[0] || "";
  return `${first}${last}`.toUpperCase();
}

export default function UserAvatar({
  user,
  className = "",
  imageClassName = "",
  fallbackClassName = "",
  alt,
  style,
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const avatarUrl = avatarSrc(user);

  useEffect(() => {
    setImageFailed(false);
  }, [avatarUrl]);

  if (avatarUrl && !imageFailed) {
    return (
      <img
        src={avatarUrl}
        alt={alt || user.displayName || `${user.firstName || ""} ${user.lastName || ""}`.trim() || "Avatar utilisateur"}
        className={`${className} ${imageClassName}`.trim()}
        style={style}
        onError={() => setImageFailed(true)}
      />
    );
  }

  return (
    <div className={`${className} ${fallbackClassName}`.trim()} style={style} aria-label={alt || "Avatar utilisateur"}>
      {getInitials(user)}
    </div>
  );
}
