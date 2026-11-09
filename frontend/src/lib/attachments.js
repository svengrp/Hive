import { useEffect, useState } from "react";
import { BASE_URL } from "./api";

/* Pièces jointes de la messagerie : envoi du fichier brut, puis lecture protégée par le jeton
   (une balise <img src> ne peut pas envoyer l'en-tête Authorization : on passe par un blob). */

export const MAX_FILE_SIZE = 5 * 1024 * 1024;
export const MAX_FILES = 4;
export const ACCEPT = "image/jpeg,image/png,image/gif,image/webp,application/pdf,.docx,.xlsx,.pptx,.txt,.csv,.zip";

const authHeader = () => {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export async function uploadAttachment(file) {
  const res = await fetch(`${BASE_URL}/messages/attachments`, {
    method: "POST",
    headers: { ...authHeader(), "Content-Type": file.type || "application/octet-stream", "X-File-Name": encodeURIComponent(file.name) },
    body: file,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.message || "Envoi du fichier impossible.");
  return data;
}

// Un fichier n'est téléchargé qu'une fois par session, même s'il apparaît dans plusieurs bulles
const cache = new Map();

export function fetchAttachment(id) {
  if (!cache.has(id)) {
    const p = fetch(`${BASE_URL}/messages/attachments/${id}`, { headers: authHeader() })
      .then((res) => {
        if (!res.ok) throw new Error("Fichier introuvable");
        return res.blob();
      })
      .then((blob) => URL.createObjectURL(blob));
    p.catch(() => cache.delete(id));
    cache.set(id, p);
  }
  return cache.get(id);
}

export function useAttachmentUrl(id, enabled = true) {
  const [url, setUrl] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!id || !enabled) return undefined;
    let alive = true;
    fetchAttachment(id).then((u) => alive && setUrl(u)).catch(() => alive && setFailed(true));
    return () => { alive = false; };
  }, [id, enabled]);
  return { url, failed };
}

export async function downloadAttachment(att) {
  const url = await fetchAttachment(att._id);
  const a = document.createElement("a");
  a.href = url;
  a.download = att.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function formatSize(bytes, lang) {
  const nf = (n, d) => new Intl.NumberFormat(lang === "en" ? "en-GB" : "fr-CH", { maximumFractionDigits: d }).format(n);
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${nf(bytes / 1024, 0)} Ko`;
  return `${nf(bytes / (1024 * 1024), 1)} Mo`;
}
