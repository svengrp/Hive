import { useCallback, useEffect, useId, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Download, FileText, MoreHorizontal, Pin } from "lucide-react";
import { PersonAvatar } from "./Avatars";
import ActionMenu from "./ActionMenu";
import { useLongPress } from "./hooks";
import { formatClock, formatFullDate, getUserName, idOf } from "./messageUtils";
import { buildMessageActions, groupReactions } from "./messageActions";
import { personStyle } from "../../lib/personColor";
import { downloadAttachment, formatSize, useAttachmentUrl } from "../../lib/attachments";
import classes from "./Chat.module.css";

function EditArea({ value, onChange, onSave, onCancel }) {
  const { t } = useTranslation();
  const ref = useRef(null);
  const hintId = useId();
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  return (
    <>
      <textarea
        ref={ref}
        className={classes.editInput}
        value={value}
        aria-label={t("messages.edit")}
        aria-describedby={hintId}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSave(); }
          if (e.key === "Escape") { e.preventDefault(); onCancel(); }
        }}
        rows={Math.max(1, value.split("\n").length)}
      />
      <span id={hintId} className={classes.editHint}>{t("messages.editHint")}</span>
    </>
  );
}

/* Amène un message cité à l'écran et le met brièvement en évidence */
export function jumpToMessage(msgId) {
  const el = typeof document !== "undefined" ? document.getElementById(`msg-${msgId}`) : null;
  if (!el) return;
  el.scrollIntoView?.({ block: "center", behavior: "smooth" });
  el.dataset.flash = "true";
  setTimeout(() => { delete el.dataset.flash; }, 1400);
}

/* Vignette d'une image jointe (chargée avec le jeton) ; un clic l'ouvre en grand dans un nouvel onglet */
function AttachedImage({ att, t }) {
  const { url, failed } = useAttachmentUrl(att._id);
  if (failed) return <span className={classes.attMissing}>{t("messages.attachmentUnavailable")}</span>;
  return (
    <button
      type="button"
      className={classes.attImageBtn}
      onClick={() => url && window.open(url, "_blank", "noopener")}
      aria-label={t("messages.openImage", { name: att.name })}
    >
      {url ? <img src={url} alt={att.name} className={classes.attImage} /> : <span className={classes.attImage} aria-hidden="true" />}
    </button>
  );
}

function Attachments({ list, t, lang }) {
  const images = list.filter((a) => a.kind === "image");
  const files = list.filter((a) => a.kind !== "image");
  return (
    <div className={classes.attachments}>
      {images.length > 0 && (
        <div className={classes.attImages} data-count={images.length}>
          {images.map((att) => <AttachedImage key={att._id} att={att} t={t} />)}
        </div>
      )}
      {files.map((att) => (
        <button
          key={att._id}
          type="button"
          className={classes.attFile}
          onClick={() => downloadAttachment(att).catch(() => {})}
          aria-label={t("messages.download", { name: att.name })}
        >
          <span className={classes.attFileIcon} aria-hidden="true"><FileText size={18} /></span>
          <span className={classes.attFileText}>
            <span className={classes.attFileName}>{att.name}</span>
            <span className={classes.attFileSize}>{formatSize(att.size, lang)}</span>
          </span>
          <Download size={16} aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}

/* Citation d'un message dans une réponse (cliquable : ramène au message d'origine) */
function Quote({ reply, t }) {
  const name = getUserName(reply.senderId, t("messages.userFallback"));
  const text = reply.deleted
    ? t("messages.quoteDeleted")
    : reply.content || (reply.attachments?.length ? t("messages.attachmentPreview", { name: reply.attachments[0].name }) : "");
  return (
    <button
      type="button"
      className={classes.quote}
      onClick={() => jumpToMessage(idOf(reply))}
      aria-label={t("messages.jumpToMessage", { name })}
    >
      <span className={classes.quoteName} style={personStyle(reply.senderId)}>{name}</span>
      <span className={classes.quoteText}>{text}</span>
    </button>
  );
}

/* Une bulle de message. pos = single | first | middle | last (coins côté auteur). */
export default function MessageBubble({
  msg,
  myId,
  isMine,
  isGroup,
  pos,
  showName,
  avatar, // "show" | "reserve" | null
  blocked,
  isLive,
  isEditing,
  editDraft,
  onEditDraft,
  onEditSave,
  onEditCancel,
  onStartEdit,
  onDelete,
  onProfile,
  onLongPress,
  onReact,
  onReply,
  onTogglePin,
}) {
  const { t, i18n } = useTranslation();
  const sender = msg.senderId;
  const senderName = getUserName(sender, t("messages.userFallback"));
  const clock = formatClock(msg.createdAt, i18n.language);
  const fullDate = formatFullDate(msg.createdAt, i18n.language);
  const muted = msg.deleted || blocked;
  const canAct = !msg.deleted && !blocked && !isEditing;
  const content = blocked
    ? t("messages.blockedMessage")
    : msg.deleted ? t("messages.deletedMessage") : msg.content;
  const metaText = msg.edited && !muted ? `${t("messages.edited")} · ${clock}` : clock;

  const menuItems = buildMessageActions({ msg, isMine, isGroup, myId, t, onReact, onReply, onTogglePin, onStartEdit, onDelete });
  const reactions = muted ? [] : groupReactions(msg.reactions, myId);
  const reply = !muted && msg.replyTo && typeof msg.replyTo === "object" ? msg.replyTo : null;

  const handleLongPress = useCallback(() => onLongPress(msg), [onLongPress, msg]);
  const pressHandlers = useLongPress(handleLongPress, { disabled: !canAct });

  const bubbleClass = [
    classes.bubble,
    isMine ? classes.bubbleMine : classes.bubbleTheirs,
    muted ? classes.bubbleMuted : "",
  ].join(" ");

  return (
    <div
      id={`msg-${idOf(msg)}`}
      className={`${classes.msgRow} ${isMine ? classes.msgRowMine : ""} ${classes[`group_${pos}`] || ""} ${isLive ? classes.msgEnter : ""}`}
    >
      {avatar === "show" && (
        <button
          type="button"
          className={classes.msgAvatarBtn}
          onClick={() => onProfile(idOf(sender))}
          aria-label={t("messages.viewProfileOf", { name: senderName })}
        >
          <PersonAvatar user={sender} size={30} />
        </button>
      )}
      {avatar === "reserve" && <span className={classes.avatarReserve} aria-hidden="true" />}

      <div className={classes.bubbleWrap}>
        <div className={classes.bubbleCol}>
          <div className={bubbleClass} data-pos={pos} {...pressHandlers}>
            <span className="sr-only">
              {t("messages.previewSender", { name: isMine ? t("messages.you") : senderName, text: "" })}
            </span>
            {showName && (
              <span className={classes.bubbleSender} style={personStyle(sender)} aria-hidden="true">{senderName}</span>
            )}
            {reply && <Quote reply={reply} t={t} />}
            {!muted && msg.attachments?.length > 0 && <Attachments list={msg.attachments} t={t} lang={i18n.language} />}
            {isEditing ? (
              <EditArea value={editDraft} onChange={onEditDraft} onSave={onEditSave} onCancel={onEditCancel} />
            ) : (
              <p className={classes.bubbleText}>
                {content}
                <span className={classes.metaSpacer} aria-hidden="true">{msg.pinned && !muted ? "\u2003" : ""}{metaText}</span>
              </p>
            )}
            {!isEditing && (
              <span className={classes.bubbleMeta}>
                {msg.pinned && !muted && (
                  <Pin size={11} className={classes.pinMark} aria-label={t("messages.pinnedTag")} role="img" />
                )}
                {msg.edited && !muted && <>{t("messages.edited")} · </>}
                <time dateTime={msg.createdAt} title={fullDate}>{clock}</time>
              </span>
            )}
          </div>
          {reactions.length > 0 && (
            <div className={classes.reactions}>
              {reactions.map((r) => (
                <button
                  key={r.emoji}
                  type="button"
                  className={`${classes.reactionChip} ${r.mine ? classes.reactionChipMine : ""}`}
                  aria-pressed={r.mine}
                  aria-label={t("messages.reactionChip", { emoji: r.emoji, count: r.count })}
                  onClick={() => onReact(msg, r.emoji)}
                >
                  <span aria-hidden="true">{r.emoji}</span>
                  <span className={classes.reactionCount}>{r.count}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {canAct && menuItems.length > 0 && (
          <ActionMenu
            items={menuItems}
            buttonLabel={t("messages.actions")}
            buttonClassName={classes.dotsBtn}
            openClassName={classes.dotsBtnOpen}
            wrapperClassName={classes.dotsWrap}
            icon={<MoreHorizontal size={16} aria-hidden="true" />}
          />
        )}
      </div>
    </div>
  );
}
