import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Send, AlertCircle, Reply, X, Paperclip, FileText, Loader2 } from "lucide-react";
import { COUNTER_FROM, MAX_LENGTH, matches } from "./messageUtils";
import { ACCEPT, MAX_FILES, MAX_FILE_SIZE, formatSize, uploadAttachment } from "../../lib/attachments";
import classes from "./Chat.module.css";

const MAX_HEIGHT = 120;

/* Zone de saisie : auto-grow, compteur à partir de 1800 caractères, erreur d'envoi, bouton Envoyer.
   Desktop : Entrée envoie, Maj+Entrée = ligne. Pointeur grossier (tactile) : Entrée = ligne. */
export default function Composer({
  convKey,
  value,
  onChange,
  onSend,
  placeholder,
  canSend,
  error,
  onDismissError,
  autoFocus,
  replyTarget, // { name, text } : message auquel on répond
  onCancelReply,
}) {
  const { t, i18n } = useTranslation();
  const ref = useRef(null);
  const errorId = useId();
  const [announce, setAnnounce] = useState("");
  const zoneRef = useRef("ok");
  const fileRef = useRef(null);
  // Fichiers joints : envoyés dès qu'ils sont choisis, cités dans le message à l'envoi
  const [files, setFiles] = useState([]); // { key, name, size, kind, status: "uploading" | "ready" | "error", att?, preview? }
  const [fileError, setFileError] = useState("");

  const length = value.length;
  const over = length > MAX_LENGTH;
  const showCounter = length >= COUNTER_FROM;
  const readyFiles = files.filter((f) => f.status === "ready");
  const uploading = files.some((f) => f.status === "uploading");
  const sendable = canSend && !over && !uploading && (value.trim().length > 0 || readyFiles.length > 0);

  const addFiles = (list) => {
    setFileError("");
    const chosen = Array.from(list || []);
    const room = MAX_FILES - files.length;
    if (chosen.length > room) setFileError(t("messages.maxFiles"));
    chosen.slice(0, Math.max(room, 0)).forEach((file) => {
      if (file.size > MAX_FILE_SIZE) {
        setFileError(t("messages.fileTooBig", { name: file.name }));
        return;
      }
      const key = `${file.name}-${file.size}-${Math.random()}`;
      const kind = file.type.startsWith("image/") && file.type !== "image/svg+xml" ? "image" : "file";
      const preview = kind === "image" ? URL.createObjectURL(file) : null;
      setFiles((prev) => [...prev, { key, name: file.name, size: file.size, kind, preview, status: "uploading" }]);
      uploadAttachment(file)
        .then((att) => setFiles((prev) => prev.map((f) => (f.key === key ? { ...f, status: "ready", att } : f))))
        .catch((err) => {
          setFiles((prev) => prev.filter((f) => f.key !== key));
          setFileError(`${file.name} : ${err.message}`);
        });
    });
  };

  const removeFile = (key) => setFiles((prev) => prev.filter((f) => f.key !== key));

  const send = () => {
    if (!sendable) return;
    onSend(readyFiles.map((f) => f.att._id));
    setFiles([]);
    setFileError("");
  };

  // Focus à l'ouverture d'une discussion (desktop uniquement)
  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [convKey, autoFocus]);

  // Répondre à un message : le curseur revient dans le champ
  useEffect(() => {
    if (replyTarget) ref.current?.focus();
  }, [replyTarget]);

  // Hauteur automatique jusqu'à 120 px
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    const border = el.offsetHeight - el.clientHeight;
    const next = Math.min((el.scrollHeight || 0) + border, MAX_HEIGHT);
    el.style.height = next > 0 ? `${next}px` : "";
  }, [value]);

  // Annonce seulement les franchissements de seuil (1800, puis au-delà de 2000)
  useEffect(() => {
    const zone = over ? "over" : showCounter ? "near" : "ok";
    if (zone === zoneRef.current) return;
    zoneRef.current = zone;
    if (zone === "near") setAnnounce(t("messages.charsLeft", { count: MAX_LENGTH - length }));
    else if (zone === "over") setAnnounce(t("messages.charsOver", { count: length - MAX_LENGTH }));
    else setAnnounce("");
  }, [over, showCounter, length, t]);

  const handleKeyDown = (e) => {
    if (e.key === "Escape" && replyTarget) { e.preventDefault(); onCancelReply(); return; }
    if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
    if (matches("(pointer: coarse)")) return; // tactile : retour à la ligne
    e.preventDefault();
    send();
  };

  const formatNumber = (n) => new Intl.NumberFormat(i18n.language || "fr").format(n);

  return (
    <div className={classes.composer}>
      {(error || fileError || showCounter) && (
        <div className={classes.composerInfo}>
          {error && (
            <div id={errorId} className={classes.sendError} role="alert">
              <AlertCircle size={16} aria-hidden="true" />
              <span>{error}</span>
              <button type="button" className={classes.iconBtn} onClick={onDismissError} aria-label={t("messages.dismissError")}>
                <X size={16} aria-hidden="true" />
              </button>
            </div>
          )}
          {fileError && (
            <div className={classes.sendError} role="alert">
              <AlertCircle size={16} aria-hidden="true" />
              <span>{fileError}</span>
              <button type="button" className={classes.iconBtn} onClick={() => setFileError("")} aria-label={t("messages.dismissError")}>
                <X size={16} aria-hidden="true" />
              </button>
            </div>
          )}
          {showCounter && (
            <span className={`${classes.counter} ${over ? classes.counterOver : ""}`} aria-hidden="true">
              {formatNumber(length)} / {formatNumber(MAX_LENGTH)}
            </span>
          )}
        </div>
      )}
      <span className="sr-only" aria-live="polite">{announce}</span>
      {replyTarget && (
        <div className={classes.replyBar}>
          <Reply size={16} aria-hidden="true" className={classes.replyBarIcon} />
          <div className={classes.replyBarText}>
            <span className={classes.replyBarName}>{t("messages.replyingTo", { name: replyTarget.name })}</span>
            <span className={classes.replyBarPreview}>{replyTarget.text}</span>
          </div>
          <button type="button" className={classes.iconBtn} onClick={onCancelReply} aria-label={t("messages.cancelReply")}>
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      )}
      {files.length > 0 && (
        <ul className={classes.pendingFiles}>
          {files.map((f) => (
            <li key={f.key} className={classes.pendingFile} data-status={f.status}>
              {f.preview ? (
                <img src={f.preview} alt="" className={classes.pendingThumb} />
              ) : (
                <span className={classes.pendingIcon} aria-hidden="true"><FileText size={18} /></span>
              )}
              <span className={classes.pendingText}>
                <span className={classes.pendingName}>{f.name}</span>
                <span className={classes.pendingSize}>
                  {f.status === "uploading" ? (
                    <><Loader2 size={12} className={classes.spin} aria-hidden="true" /> {t("messages.uploading")}</>
                  ) : formatSize(f.size, i18n.language)}
                </span>
              </span>
              <button type="button" className={classes.iconBtn} onClick={() => removeFile(f.key)} aria-label={t("messages.removeFile", { name: f.name })}>
                <X size={15} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className={classes.composerRow}>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept={ACCEPT}
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }}
        />
        <button
          type="button"
          className={classes.attachBtn}
          onClick={() => fileRef.current?.click()}
          disabled={!canSend || files.length >= MAX_FILES}
          aria-label={t("messages.attach")}
          title={t("messages.attach")}
        >
          <Paperclip size={19} aria-hidden="true" />
        </button>
        <textarea
          ref={ref}
          className={`${classes.input} ${over ? classes.inputOver : ""}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={(e) => { if (e.clipboardData?.files?.length) { e.preventDefault(); addFiles(e.clipboardData.files); } }}
          placeholder={placeholder}
          aria-label={t("messages.composerLabel")}
          aria-invalid={over || !!error || undefined}
          aria-describedby={error ? errorId : undefined}
          rows={1}
        />
        <button
          type="button"
          className={classes.sendBtn}
          onClick={send}
          disabled={!sendable}
          aria-label={t("messages.send")}
        >
          <Send size={20} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
