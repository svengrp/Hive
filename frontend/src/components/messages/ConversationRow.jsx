import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { PersonAvatar, ProjectAvatar } from "./Avatars";
import { useLongPress } from "./hooks";
import { formatListTime, getUserName, idOf } from "./messageUtils";
import classes from "./ConversationList.module.css";

/* Texte d'aperçu : « Vous : … », « Léa : … » (groupe), ou « Démarrez la discussion » */
function usePreview(item, myId) {
  const { t } = useTranslation();
  const last = item.lastMessage;
  if (!last) return item.type === "group" ? t("messages.startDiscussion") : "";
  const text = last.deleted
    ? t("messages.deletedMessage")
    : last.content || (last.attachments?.length ? t("messages.attachmentPreview", { name: last.attachments[0].name }) : "");
  if (last.isSystem) return text;
  if (idOf(last.senderId) === myId) return t("messages.previewSender", { name: t("messages.you"), text });
  if (item.type === "group") {
    return t("messages.previewSender", { name: getUserName(last.senderId, t("messages.userFallback")), text });
  }
  return text;
}

export default function ConversationRow({ item, active, myId, onOpen, onLongPress }) {
  const { t, i18n } = useTranslation();
  const preview = usePreview(item, myId);
  const unread = item.unread || 0;
  const emphasized = unread > 0 || item.hasNew;
  const time = formatListTime(item.lastMessage?.createdAt, i18n.language, t);

  const handleLongPress = useCallback(() => onLongPress(item), [onLongPress, item]);
  const pressHandlers = useLongPress(handleLongPress);

  return (
    <li>
      <button
        type="button"
        data-conv-key={item.key}
        className={`${classes.row} ${active ? classes.rowActive : ""} ${emphasized ? classes.rowUnread : ""}`}
        aria-current={active ? "true" : undefined}
        onClick={() => onOpen(item)}
        {...pressHandlers}
      >
        {item.type === "group"
          ? <ProjectAvatar conversation={item.conversation} title={item.name} size={48} />
          : <PersonAvatar user={item.partner} size={48} />}
        <span className={classes.rowMain}>
          <span className={classes.rowLine}>
            <span className={classes.rowName}>{item.name}</span>
            {time && <span className={classes.rowTime}>{time}</span>}
          </span>
          <span className={classes.rowLine}>
            <span className={classes.rowPreview}>{preview}</span>
            {unread > 0 && (
              <span className={classes.badge} aria-hidden="true">{unread > 99 ? "99+" : unread}</span>
            )}
            {unread === 0 && item.hasNew && <span className={classes.newDot} aria-hidden="true" />}
          </span>
        </span>
        {unread > 0 && <span className="sr-only">{t("messages.unreadCount", { count: unread })}</span>}
        {unread === 0 && item.hasNew && <span className="sr-only">{t("messages.newActivity")}</span>}
      </button>
    </li>
  );
}
