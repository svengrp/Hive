import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  MessageSquare, Archive, Ban, ShieldOff, User, FolderOpen, Users, X, ArrowLeft, ClipboardList,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useSocket } from "../context/SocketContext";
import ConversationList from "../components/messages/ConversationList";
import ChatHeader from "../components/messages/ChatHeader";
import MessageList from "../components/messages/MessageList";
import Composer from "../components/messages/Composer";
import MembersPanel from "../components/messages/MembersPanel";
import WorkspacePanel from "../components/messages/WorkspacePanel";
import { jumpToMessage } from "../components/messages/MessageBubble";
import { BlockedBanner, ClosedBanner } from "../components/messages/ChatFooter";
import { PersonAvatar, ProjectAvatar } from "../components/messages/Avatars";
import { RatingModal, KickModal, BlockModal, DeleteConvModal } from "../components/messages/MessageModals";
import useConversationLists from "../components/messages/useConversationLists";
import useChatSocket from "../components/messages/useChatSocket";
import useGroupModeration from "../components/messages/useGroupModeration";
import useConversationActions from "../components/messages/useConversationActions";
import { buildListItems, buildArchivedItems } from "../components/messages/listItems";
import { useMediaQuery, MOBILE_QUERY, WIDE_QUERY } from "../components/messages/hooks";
import {
  MAX_LENGTH, dmKey, groupKey, getGroupTitle, getUserName, idOf,
} from "../components/messages/messageUtils";
import classes from "./MessagesPage.module.css";

const TYPING_EMIT_INTERVAL_MS = 1500;

/* Clé de conversation → { type: "dm" | "grp", id } */
function parseKey(key) {
  if (!key) return { type: null, id: null };
  const [type, ...rest] = key.split("-");
  return { type, id: rest.join("-") };
}

function messagesPath(key) {
  const { type, id } = parseKey(key);
  return type === "grp" ? `/messages/group/${id}` : `/messages/${id}`;
}

export default function MessagesPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const socket = useSocket();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const withUserId = searchParams.get("with");
  const withGroupId = searchParams.get("group");
  const myId = idOf(user);
  const isMobile = useMediaQuery(MOBILE_QUERY);
  const isWide = useMediaQuery(WIDE_QUERY);
  const chatTitleId = useId();
  const membersPanelId = useId();
  const workspacePanelId = useId();

  // Conversation ouverte : l'URL fait foi (?group=<convId> prioritaire sur ?with=<userId>)
  const activeKey = withGroupId ? groupKey(withGroupId) : withUserId ? dmKey(withUserId) : null;

  const lists = useConversationLists(myId);
  const {
    conversations, setConversations, groupConvs, setGroupConvs, listStatus,
    archivedConvs, setArchivedConvs, archivedDMs, setArchivedDMs,
    blockedUserIds, listsRef,
    loadLists, loadGroupConvs, markGroupRead, getLastRead,
  } = lists;

  const [profilePartner, setProfilePartner] = useState(null); // interlocuteur sans conversation existante
  const [profileFailed, setProfileFailed] = useState(false);
  const [messages, setMessages] = useState([]);
  const [msgsStatus, setMsgsStatus] = useState("idle");
  const [reloadToken, setReloadToken] = useState(0);
  const [drafts, setDrafts] = useState({}); // brouillon par conversation
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState("");
  const [showMembers, setShowMembers] = useState(false);
  const [showWorkspace, setShowWorkspace] = useState(false);
  const [replyTargets, setReplyTargets] = useState({}); // message auquel on répond, par conversation

  // Modales
  const [blockTarget, setBlockTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const lastTypingEmitRef = useRef(0);
  const lastOpenedKeyRef = useRef(null);

  // ---------- Résolution de la conversation active ----------
  const activeGroupEntry = withGroupId
    ? groupConvs.find((gc) => idOf(gc.conversation) === withGroupId) ||
      archivedConvs.find((gc) => idOf(gc.conversation) === withGroupId)
    : null;
  const activeGroup = activeGroupEntry?.conversation || null;
  const existingDM = !withGroupId && withUserId
    ? conversations.find((c) => idOf(c.partner) === withUserId)
    : null;
  const activePartner = !withGroupId && withUserId
    ? existingDM?.partner ||
      archivedDMs.find((d) => idOf(d.partner) === withUserId)?.partner ||
      (idOf(profilePartner) === withUserId ? profilePartner : null)
    : null;
  const isGroup = !!activeGroup;
  const hasActive = !!(activeGroup || activePartner);
  const notFound = !!activeKey && !hasActive && listStatus !== "loading" && (withGroupId ? true : profileFailed);
  const chatOpen = !!activeKey && !notFound;

  // Lien profond vers quelqu'un sans conversation : on charge son profil
  useEffect(() => {
    if (withGroupId || !withUserId || listStatus === "loading") return;
    const known =
      listsRef.current.conversations.some((c) => idOf(c.partner) === withUserId) ||
      listsRef.current.archivedDMs.some((d) => idOf(d.partner) === withUserId);
    if (known) return;
    let cancelled = false;
    setProfileFailed(false);
    api(`/user/${withUserId}`)
      .then((profile) => { if (!cancelled) setProfilePartner(profile); })
      .catch((err) => { console.error(err); if (!cancelled) setProfileFailed(true); });
    return () => { cancelled = true; };
  }, [withUserId, withGroupId, listStatus, listsRef]);

  // ---------- Messages de la conversation active ----------
  const activeKeyRef = useRef(activeKey);
  useEffect(() => { activeKeyRef.current = activeKey; }, [activeKey]);

  useEffect(() => {
    setEditingId(null);
    setShowMembers(false);
    setShowWorkspace(false);
    if (!activeKey) {
      setMessages([]);
      setMsgsStatus("idle");
      return undefined;
    }
    let cancelled = false;
    setMessages([]);
    setMsgsStatus("loading");
    api(messagesPath(activeKey))
      .then((data) => {
        if (cancelled) return;
        setMessages(Array.isArray(data) ? data : []);
        setMsgsStatus("ready");
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) setMsgsStatus("error");
      });
    return () => { cancelled = true; };
  }, [activeKey, reloadToken]);

  // Rafraîchissement silencieux (reconnexion) : pas de squelette, pas de saut de défilement
  const refreshActiveMessages = useCallback(() => {
    const key = activeKeyRef.current;
    if (!key) return;
    api(messagesPath(key))
      .then((data) => { if (activeKeyRef.current === key && Array.isArray(data)) setMessages(data); })
      .catch(console.error);
  }, []);

  // ---------- Lecture ----------
  const markDMRead = useCallback((partnerId) => {
    api(`/messages/${partnerId}/read`, { method: "PUT" }).catch(console.error);
    setConversations((prev) => prev.map((c) => (idOf(c.partner) === partnerId ? { ...c, unread: 0 } : c)));
  }, [setConversations]);

  const markActiveRead = useCallback(() => {
    const key = activeKeyRef.current;
    if (!key || document.visibilityState === "hidden") return;
    const { type, id } = parseKey(key);
    if (type === "dm") {
      markDMRead(id);
      return;
    }
    // Horodatage serveur du dernier message si l'horloge locale retarde
    const entry = listsRef.current.groupConvs.find((gc) => idOf(gc.conversation) === id);
    const last = entry?.lastMessage?.createdAt ? new Date(entry.lastMessage.createdAt).getTime() : 0;
    markGroupRead(id, Math.max(Date.now(), last));
  }, [markDMRead, markGroupRead, listsRef]);

  useEffect(() => {
    if (activeKey) markActiveRead();
  }, [activeKey, markActiveRead]);

  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") markActiveRead(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [markActiveRead]);

  // Rejoindre la salle socket du groupe ouvert
  useEffect(() => {
    if (socket && withGroupId) socket.emit("join_conversation", withGroupId);
  }, [socket, withGroupId]);

  // ---------- Temps réel ----------
  const closeConversation = useCallback(() => navigate("/messages", { replace: true }), [navigate]);

  const socketLists = useMemo(() => ({
    setConversations, setGroupConvs, setArchivedConvs, setArchivedDMs,
    listsRef, loadGroupConvs, loadLists, markGroupRead,
  }), [setConversations, setGroupConvs, setArchivedConvs, setArchivedDMs, listsRef, loadGroupConvs, loadLists, markGroupRead]);

  const { typing, sendError, setSendError, trackSend } = useChatSocket({
    socket,
    myId,
    activeKey,
    activeGroup,
    lists: socketLists,
    setMessages,
    refreshActiveMessages,
    setDrafts,
    onKicked: closeConversation,
  });

  // L'erreur d'envoi disparaît au changement de conversation
  useEffect(() => { setSendError(null); }, [activeKey, setSendError]);

  // ---------- Mobile : BottomNav masquée pendant une discussion, focus rendu à la ligne quittée ----------
  useEffect(() => {
    if (!isMobile || !chatOpen) return undefined;
    document.body.dataset.chat = "open";
    return () => { delete document.body.dataset.chat; };
  }, [isMobile, chatOpen]);

  useEffect(() => {
    if (activeKey) {
      lastOpenedKeyRef.current = activeKey;
      return;
    }
    const previous = lastOpenedKeyRef.current;
    if (isMobile && previous) {
      document.querySelector(`[data-conv-key="${previous}"]`)?.focus();
    }
  }, [activeKey, isMobile]);

  // ---------- Liste unique triée par activité ----------
  const listItems = useMemo(
    () => buildListItems({ conversations, groupConvs, getLastRead, myId, activeKey, t }),
    [conversations, groupConvs, getLastRead, myId, activeKey, t]
  );
  const archivedItems = useMemo(
    () => buildArchivedItems({ archivedDMs, archivedConvs, t }),
    [archivedDMs, archivedConvs, t]
  );

  // ---------- Navigation ----------
  const openItem = useCallback((item) => {
    navigate(item.type === "group" ? `/messages?group=${item.id}` : `/messages?with=${item.id}`, { replace: true });
  }, [navigate]);

  // ---------- Archivage, suppression, blocage ----------
  const actions = useConversationActions({ lists, activeKeyRef, closeConversation });
  const { actionError, setActionError, fail, archive, unarchive } = actions;

  const confirmDelete = () => {
    const item = deleteTarget;
    setDeleteTarget(null);
    if (item) actions.deleteGroup(item);
  };

  // ---------- Envoi ----------
  const draft = (activeKey && drafts[activeKey]) || "";
  const setDraftFor = (key, value) => setDrafts((prev) => ({ ...prev, [key]: value }));

  const handleDraftChange = (value) => {
    if (!activeKey) return;
    setDraftFor(activeKey, value);
    if (sendError?.key === activeKey) setSendError(null);
    const now = Date.now();
    if (!socket || !value || now - lastTypingEmitRef.current < TYPING_EMIT_INTERVAL_MS) return;
    lastTypingEmitRef.current = now;
    const { type, id } = parseKey(activeKey);
    if (type === "grp") socket.emit("typing_group", { conversationId: id });
    else socket.emit("typing", { to: id });
  };

  const replyTarget = (activeKey && replyTargets[activeKey]) || null;
  const startReply = (msg) => {
    if (activeKey) setReplyTargets((prev) => ({ ...prev, [activeKey]: msg }));
  };
  const cancelReply = () => {
    if (!activeKey) return;
    setReplyTargets((prev) => {
      const next = { ...prev };
      delete next[activeKey];
      return next;
    });
  };

  // attachments : ids des fichiers déjà envoyés par le compositeur (lib/attachments.js)
  const sendMessage = (attachments = []) => {
    const content = draft.trim();
    if ((!content && !attachments.length) || content.length > MAX_LENGTH || !socket || !activeKey) return;
    const { type, id } = parseKey(activeKey);
    const replyTo = replyTarget ? idOf(replyTarget) : undefined;
    const files = attachments.length ? { attachments } : {};
    if (type === "grp") socket.emit("send_group_message", { conversationId: id, content, replyTo, ...files });
    else socket.emit("send_message", { to: id, content, replyTo, ...files });
    lastTypingEmitRef.current = 0;
    setDraftFor(activeKey, "");
    if (replyTarget) cancelReply();
    setSendError(null);
    trackSend(activeKey, content);
  };

  // ---------- Édition / suppression de ses messages ----------
  const patchMessage = (msgId, patch) =>
    setMessages((prev) => prev.map((m) => (idOf(m) === msgId ? { ...m, ...patch } : m)));

  const handleDeleteMsg = async (msgId) => {
    try {
      await api(`/messages/${msgId}/delete`, { method: "DELETE" });
      patchMessage(msgId, { deleted: true });
    } catch (err) { fail(err); }
  };

  const handleEditSave = async (msgId) => {
    const content = editDraft.trim();
    if (!content) return;
    try {
      await api(`/messages/${msgId}/edit`, { method: "PUT", body: JSON.stringify({ content }) });
      patchMessage(msgId, { content, edited: true });
    } catch (err) {
      fail(err);
    } finally {
      setEditingId(null);
      setEditDraft("");
    }
  };

  // ---------- Réactions et épingles ----------
  const handleReact = async (msg, emoji) => {
    try {
      const data = await api(`/messages/${idOf(msg)}/react`, { method: "POST", body: JSON.stringify({ emoji }) });
      if (data?.reactions) patchMessage(idOf(msg), { reactions: data.reactions });
    } catch (err) { fail(err); }
  };

  const handleTogglePin = async (msg) => {
    try {
      const data = await api(`/messages/${idOf(msg)}/pin`, { method: "PUT", body: JSON.stringify({ pinned: !msg.pinned }) });
      if (data) patchMessage(idOf(msg), { pinned: data.pinned, pinnedBy: data.pinnedBy, pinnedAt: data.pinnedAt });
    } catch (err) { fail(err); }
  };

  const handleBlockConfirm = () => {
    const target = blockTarget;
    setBlockTarget(null);
    if (target) actions.block(target);
  };
  const handleUnblock = actions.unblock;

  // ---------- Groupe : propriétaire, retrait, notation ----------
  const moderation = useGroupModeration({ activeGroup, myId, setGroupConvs, loadGroupConvs });
  const { projectId: groupProjectId, isClosed, participants } = moderation;

  // ---------- Menus ----------
  const activeName = isGroup
    ? getGroupTitle(activeGroup, t("messages.groupDefault"))
    : activePartner ? getUserName(activePartner, t("messages.userFallback")) : "";
  const isPartnerBlocked = !!activePartner && blockedUserIds.has(idOf(activePartner));

  const getRowActions = useCallback((item) => (item.type === "group"
    ? [
      { key: "archive", label: t("messages.archiveConv"), icon: Archive, onSelect: () => archive(item) },
      ...(idOf(item.conversation?.projectId)
        ? [{ key: "project", label: t("messages.viewProject"), icon: FolderOpen, onSelect: () => navigate(`/projects/${idOf(item.conversation.projectId)}`) }]
        : []),
    ]
    : [
      { key: "archive", label: t("messages.archiveConv"), icon: Archive, onSelect: () => archive(item) },
      { key: "profile", label: t("messages.viewProfile"), icon: User, onSelect: () => navigate(`/users/${item.id}`) },
    ]), [archive, navigate, t]);

  const headerMenuItems = isGroup
    ? [
      ...(groupProjectId
        ? [{ key: "project", label: t("messages.viewProject"), icon: FolderOpen, onSelect: () => navigate(`/projects/${groupProjectId}`) }]
        : []),
      { key: "workspace", label: t("messages.workspace"), icon: ClipboardList, onSelect: () => { setShowMembers(false); setShowWorkspace(true); } },
      { key: "members", label: t("messages.members"), icon: Users, onSelect: () => { setShowWorkspace(false); setShowMembers(true); } },
      { key: "archive", label: t("messages.archiveConv"), icon: Archive, onSelect: () => archive({ type: "group", id: idOf(activeGroup), key: activeKey }) },
    ]
    : activePartner
      ? [
        { key: "profile", label: t("messages.viewProfile"), icon: User, onSelect: () => navigate(`/users/${idOf(activePartner)}`) },
        ...(existingDM
          ? [{ key: "archive", label: t("messages.archiveConv"), icon: Archive, onSelect: () => archive({ type: "dm", id: idOf(activePartner), key: activeKey }) }]
          : []),
        { key: "sep", separator: true },
        isPartnerBlocked
          ? { key: "unblock", label: t("messages.unblockName", { name: activeName }), icon: ShieldOff, onSelect: () => handleUnblock(activePartner) }
          : { key: "block", label: t("messages.blockName", { name: activeName }), icon: Ban, danger: true, onSelect: () => setBlockTarget(activePartner) },
      ]
      : [];

  // ---------- En-tête : sous-titre (frappe uniquement si vraie) ----------
  let subtitle = null;
  const typingNow = !!typing && typing.key === activeKey;
  if (typingNow) {
    if (isGroup) {
      const who = participants.find((p) => idOf(p) === typing.from);
      subtitle = who
        ? t("messages.typingGroup", { name: getUserName(who, t("messages.userFallback")) })
        : t("messages.typingSomeone");
    } else {
      subtitle = t("messages.typingDirect");
    }
  } else if (isGroup) {
    subtitle = t("messages.participants", { count: participants.length });
  }

  const membersVariant = isMobile ? "sheet" : isWide ? "inline" : "drawer";

  const emptyState = (
    <div className={classes.chatEmpty}>
      {isGroup
        ? <ProjectAvatar conversation={activeGroup} title={activeName} size={64} />
        : <PersonAvatar user={activePartner} size={64} />}
      <p className={classes.chatEmptyName}>{activeName}</p>
      <p className={classes.chatEmptyText}>
        {isGroup ? t("messages.emptyGroup") : t("messages.emptyDirect", { name: activeName })}
      </p>
    </div>
  );

  let footer = null;
  if (isClosed) {
    footer = (
      <ClosedBanner
        members={moderation.closedMembers}
        ratedUsers={moderation.ratedUsers}
        onRate={moderation.openRating}
      />
    );
  } else if (isPartnerBlocked) {
    footer = <BlockedBanner name={activeName} onUnblock={() => handleUnblock(activePartner)} />;
  } else if (hasActive) {
    footer = (
      <Composer
        key={activeKey}
        convKey={activeKey}
        value={draft}
        onChange={handleDraftChange}
        onSend={sendMessage}
        placeholder={isGroup
          ? t("messages.placeholderGroup", { title: activeName })
          : t("messages.placeholderDirect", { name: activeName })}
        canSend={!!socket}
        error={sendError && sendError.key === activeKey ? t(sendError.messageKey) : ""}
        onDismissError={() => setSendError(null)}
        autoFocus={!isMobile}
        replyTarget={replyTarget ? {
          name: idOf(replyTarget.senderId) === myId ? t("messages.you") : getUserName(replyTarget.senderId, t("messages.userFallback")),
          text: replyTarget.content || (replyTarget.attachments?.length ? t("messages.attachmentPreview", { name: replyTarget.attachments[0].name }) : ""),
        } : null}
        onCancelReply={cancelReply}
      />
    );
  }

  return (
    <div className={`${classes.layout} ${chatOpen ? classes.layoutChatOpen : ""}`}>
      {actionError && (
        <div className={classes.actionError} role="alert">
          <span>{actionError}</span>
          <button type="button" className={classes.iconBtn} onClick={() => setActionError("")} aria-label={t("messages.dismissError")}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>
      )}

      <aside className={classes.sidebar} aria-label={t("messages.conversations")}>
        <ConversationList
          items={listItems}
          status={listStatus}
          onRetry={() => loadLists()}
          activeKey={activeKey}
          myId={myId}
          onOpen={openItem}
          getRowActions={getRowActions}
          archivedItems={archivedItems}
          onUnarchive={unarchive}
          onDelete={setDeleteTarget}
        />
      </aside>

      {hasActive ? (
        <section className={classes.chat} aria-labelledby={chatTitleId}>
          <ChatHeader
            titleId={chatTitleId}
            isGroup={isGroup}
            name={activeName}
            partner={activePartner}
            conversation={activeGroup}
            subtitle={subtitle}
            subtitleIsTyping={typingNow}
            showBack={isMobile}
            onBack={closeConversation}
            onIdentity={isGroup ? () => { setShowWorkspace(false); setShowMembers((v) => !v); } : () => navigate(`/users/${idOf(activePartner)}`)}
            identityLabel={t("messages.viewProfileOf", { name: activeName })}
            membersOpen={showMembers}
            membersPanelId={membersPanelId}
            menuItems={headerMenuItems}
            extraAction={isGroup ? {
              label: showWorkspace ? t("workspace.close") : t("workspace.open"),
              icon: ClipboardList,
              pressed: showWorkspace,
              controls: workspacePanelId,
              onClick: () => { setShowMembers(false); setShowWorkspace((v) => !v); },
            } : null}
          />
          <div className={classes.chatBody}>
            <MessageList
              key={activeKey}
              status={msgsStatus === "idle" ? "loading" : msgsStatus}
              messages={messages}
              myId={myId}
              isGroup={isGroup}
              blockedUserIds={blockedUserIds}
              logLabel={isGroup
                ? t("messages.logLabelGroup", { title: activeName })
                : t("messages.logLabelDirect", { name: activeName })}
              emptyState={emptyState}
              onRetry={() => setReloadToken((n) => n + 1)}
              editingId={editingId}
              editDraft={editDraft}
              onEditDraft={setEditDraft}
              onEditSave={handleEditSave}
              onEditCancel={() => { setEditingId(null); setEditDraft(""); }}
              onStartEdit={(msg) => { setEditingId(idOf(msg)); setEditDraft(msg.content); }}
              onDelete={handleDeleteMsg}
              onProfile={(userId) => navigate(`/users/${userId}`)}
              onReact={handleReact}
              onReply={startReply}
              onTogglePin={handleTogglePin}
            />
            {showMembers && isGroup && (
              <MembersPanel
                id={membersPanelId}
                variant={membersVariant}
                participants={participants}
                myId={myId}
                isOwner={moderation.isOwner}
                onClose={() => setShowMembers(false)}
                onProfile={(userId) => navigate(`/users/${userId}`)}
                onKick={moderation.openKick}
              />
            )}
            {showWorkspace && isGroup && (
              <WorkspacePanel
                id={workspacePanelId}
                variant={membersVariant}
                convId={idOf(activeGroup)}
                participants={participants}
                myId={myId}
                isOwner={moderation.isOwner}
                onClose={() => setShowWorkspace(false)}
                onJump={(msgId) => {
                  // Feuille / tiroir : on les ferme d'abord pour voir le message
                  if (membersVariant !== "inline") setShowWorkspace(false);
                  setTimeout(() => jumpToMessage(msgId), membersVariant !== "inline" ? 250 : 0);
                }}
              />
            )}
          </div>
          {footer}
        </section>
      ) : chatOpen ? (
        <section className={classes.chat} aria-busy="true">
          {isMobile && (
            <div className={classes.pendingHead}>
              <button type="button" className={classes.iconBtn} onClick={closeConversation} aria-label={t("messages.backToList")}>
                <ArrowLeft size={20} aria-hidden="true" />
              </button>
            </div>
          )}
          <div className={classes.chatPending}>
            <span className="sr-only">{t("messages.loadingMessages")}</span>
          </div>
        </section>
      ) : (
        <section className={`${classes.chat} ${classes.chatIdle}`}>
          <div className={classes.placeholder}>
            <span className={classes.placeholderBadge} aria-hidden="true"><MessageSquare size={28} /></span>
            <h2 className={classes.placeholderTitle}>{t("messages.selectConvo")}</h2>
            <p className={classes.placeholderText}>{t("messages.selectConvoText")}</p>
          </div>
        </section>
      )}

      {moderation.rating && (
        <RatingModal
          target={moderation.rating.target}
          score={moderation.rating.score}
          comment={moderation.rating.comment}
          loading={moderation.rating.loading}
          error={moderation.rating.error}
          onScore={(score) => moderation.setRating((r) => ({ ...r, score }))}
          onComment={(comment) => moderation.setRating((r) => ({ ...r, comment }))}
          onSubmit={moderation.submitRating}
          onClose={() => moderation.setRating(null)}
        />
      )}

      {moderation.kick && (
        <KickModal
          target={moderation.kick.target}
          reason={moderation.kick.reason}
          rating={moderation.kick.rating}
          loading={moderation.kick.loading}
          error={moderation.kick.error}
          onReason={(reason) => moderation.setKick((k) => ({ ...k, reason }))}
          onRating={(value) => moderation.setKick((k) => ({ ...k, rating: value }))}
          onSubmit={moderation.submitKick}
          onClose={() => moderation.setKick(null)}
        />
      )}

      {blockTarget && (
        <BlockModal
          name={getUserName(blockTarget, t("messages.userFallback"))}
          onConfirm={handleBlockConfirm}
          onClose={() => setBlockTarget(null)}
        />
      )}

      {deleteTarget && (
        <DeleteConvModal
          title={deleteTarget.name}
          onConfirm={confirmDelete}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
