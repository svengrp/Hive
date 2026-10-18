import { BASE_URL } from "./api";

/* Photos de profil.
   - Une photo envoyée est stockée à part par l'API : le profil ne porte qu'avatarVersion et
     l'image est servie par GET /user/:id/avatar?v=… (mise en cache par le navigateur).
   - Un lien externe (Google, GitHub, URL collée) reste dans avatarUrl.
   - Avant l'envoi, la photo est recadrée en carré et réduite dans le navigateur (une photo de
     téléphone de plusieurs Mo devient ~30 Ko). */

export const AVATAR_ACCEPT = "image/jpeg,image/png,image/webp";
const MAX_SOURCE_BYTES = 15 * 1024 * 1024;
const SIZE = 320;
const MAX_BYTES = 190 * 1024;

/* Adresse de l'image à afficher pour une personne (ou null : initiales) */
export function avatarSrc(user) {
  const url = user?.avatarUrl?.trim();
  // « /avatars/default.png » : valeur par défaut des anciens comptes, sans image réelle → initiales
  if (url && !url.startsWith("/avatars/")) return url;
  if (user?._id && user.avatarVersion) return `${BASE_URL}/user/${user._id}/avatar?v=${user.avatarVersion}`;
  return null;
}

/* Fichier choisi → data URL carrée (WebP, ou JPEG en repli). Erreurs : invalidType, tooLarge, unreadable. */
export async function prepareAvatar(file) {
  if (!file || !AVATAR_ACCEPT.split(",").includes(file.type)) throw new Error("invalidType");
  if (file.size > MAX_SOURCE_BYTES) throw new Error("tooLarge");

  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("unreadable");
  }

  try {
    const side = Math.min(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.min(SIZE, side);
    canvas.height = canvas.width;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    // Recadrage centré
    ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, canvas.width, canvas.height);

    for (const type of ["image/webp", "image/jpeg"]) {
      for (const quality of [0.86, 0.76, 0.62]) {
        const dataUrl = canvas.toDataURL(type, quality);
        if (!dataUrl.startsWith(`data:${type}`)) break; // pas d'encodeur WebP : on passe au JPEG
        const bytes = Math.floor(((dataUrl.length - dataUrl.indexOf(",") - 1) * 3) / 4);
        if (bytes <= MAX_BYTES) return dataUrl;
      }
    }
    throw new Error("tooLarge");
  } finally {
    bitmap.close?.();
  }
}
