import { BASE_URL } from "./api";

/* Bannière du profil : recadrée au format 4:1 et compressée dans le navigateur avant l'envoi,
   servie par GET /user/:id/banner?v=… (mise en cache jusqu'au prochain changement). */

export const BANNER_ACCEPT = "image/jpeg,image/png,image/webp";
const MAX_SOURCE_BYTES = 15 * 1024 * 1024;
const WIDTH = 1600;
const RATIO = 4; // largeur / hauteur
const MAX_BYTES = 580 * 1024;

export function bannerSrc(user) {
  if (!user?._id || !user.bannerVersion) return null;
  return `${BASE_URL}/user/${user._id}/banner?v=${user.bannerVersion}`;
}

const approxBytes = (dataUrl) => Math.floor(((dataUrl.length - dataUrl.indexOf(",") - 1) * 3) / 4);

/* Fichier → data URL (WebP, ou JPEG en repli). Erreurs : invalidType, tooLarge, unreadable. */
export async function prepareBanner(file) {
  if (!file || !BANNER_ACCEPT.split(",").includes(file.type)) throw new Error("invalidType");
  if (file.size > MAX_SOURCE_BYTES) throw new Error("tooLarge");
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("unreadable");
  }
  try {
    // Recadrage centré au format de la bannière
    let sw = bitmap.width;
    let sh = Math.round(sw / RATIO);
    if (sh > bitmap.height) {
      sh = bitmap.height;
      sw = Math.round(sh * RATIO);
    }
    const sx = Math.round((bitmap.width - sw) / 2);
    const sy = Math.round((bitmap.height - sh) / 2);
    const canvas = document.createElement("canvas");
    canvas.width = Math.min(WIDTH, sw);
    canvas.height = Math.round(canvas.width / RATIO);
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    for (const type of ["image/webp", "image/jpeg"]) {
      for (const quality of [0.84, 0.74, 0.62, 0.5]) {
        const dataUrl = canvas.toDataURL(type, quality);
        if (!dataUrl.startsWith(`data:${type}`)) break; // pas d'encodeur WebP : on passe au JPEG
        if (approxBytes(dataUrl) <= MAX_BYTES) return dataUrl;
      }
    }
    throw new Error("tooLarge");
  } finally {
    bitmap.close?.();
  }
}
