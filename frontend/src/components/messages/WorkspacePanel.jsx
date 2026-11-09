import { useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertCircle, CalendarPlus, MapPin, PinOff, Plus, RotateCw, Trash2 } from "lucide-react";
import { PersonAvatar } from "./Avatars";
import SidePanel from "./SidePanel";
import useWorkspace from "./useWorkspace";
import { getUserName, idOf } from "./messageUtils";
import { personStyle } from "../../lib/personColor";
import classes from "./Workspace.module.css";

const TABS = ["tasks", "agenda", "pinned"];

const todayISO = () => new Date().toISOString().slice(0, 10);

function useFormatters() {
  const { i18n } = useTranslation();
  const lang = i18n.language || "fr";
  return useMemo(() => {
    const make = (options) => {
      try { return new Intl.DateTimeFormat(lang, options); } catch { return new Intl.DateTimeFormat("fr", options); }
    };
    return {
      day: make({ day: "numeric", month: "short" }),
      dayNum: make({ day: "numeric" }),
      month: make({ month: "short" }),
      weekdayTime: make({ weekday: "long", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }),
      full: make({ dateStyle: "medium", timeStyle: "short" }),
    };
  }, [lang]);
}

/* ── Tâches ─────────────────────────────────────────────────────────────── */
function TasksTab({ ws, participants, myId, isOwner }) {
  const { t } = useTranslation();
  const fmt = useFormatters();
  const [title, setTitle] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [busy, setBusy] = useState(false);
  const titleId = useId();
  const assigneeFieldId = useId();
  const dueFieldId = useId();

  const open = ws.tasks.filter((task) => !task.done);
  const done = ws.tasks.filter((task) => task.done);
  const canDelete = (task) => isOwner || idOf(task.createdBy) === myId;

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    const ok = await ws.addTask({ title: title.trim(), assigneeId: assigneeId || null, dueDate: dueDate || null });
    setBusy(false);
    if (ok) { setTitle(""); setAssigneeId(""); setDueDate(""); }
  };

  const renderTask = (task) => {
    const overdue = !task.done && task.dueDate && task.dueDate.slice(0, 10) < todayISO();
    const due = task.dueDate ? fmt.day.format(new Date(task.dueDate)) : null;
    const assignee = task.assigneeId;
    return (
      <li key={task._id} className={`${classes.task} ${task.done ? classes.taskDone : ""}`}>
        <input
          type="checkbox"
          className={classes.check}
          checked={task.done}
          onChange={() => ws.toggleTask(task)}
          aria-label={t(task.done ? "workspace.markUndone" : "workspace.markDone", { title: task.title })}
        />
        <div className={classes.taskBody}>
          <span className={classes.taskTitle}>{task.title}</span>
          {(assignee || due) && (
            <span className={classes.taskMeta}>
              {assignee && (
                <span className={classes.assignee}>
                  <PersonAvatar user={assignee} size={18} />
                  {getUserName(assignee, t("messages.userFallback"))}
                </span>
              )}
              {due && (
                <span className={overdue ? classes.overdue : undefined}>
                  {overdue ? t("workspace.overdue", { date: due }) : t("workspace.dueOn", { date: due })}
                </span>
              )}
            </span>
          )}
        </div>
        {canDelete(task) && (
          <button
            type="button"
            className={classes.iconBtn}
            onClick={() => ws.deleteTask(task)}
            aria-label={t("workspace.deleteTask", { title: task.title })}
          >
            <Trash2 size={16} aria-hidden="true" />
          </button>
        )}
      </li>
    );
  };

  return (
    <>
      <form className={classes.form} onSubmit={submit}>
        <label className={classes.label} htmlFor={titleId}>{t("workspace.newTaskLabel")}</label>
        <input
          id={titleId}
          className={classes.input}
          value={title}
          maxLength={200}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("workspace.newTaskPlaceholder")}
        />
        <div className={classes.formRow}>
          <div className={classes.field}>
            <label className={classes.labelSmall} htmlFor={assigneeFieldId}>{t("workspace.assignee")}</label>
            <select id={assigneeFieldId} className={classes.input} value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
              <option value="">{t("workspace.nobody")}</option>
              {participants.map((p) => (
                <option key={idOf(p)} value={idOf(p)}>
                  {getUserName(p, t("messages.userFallback"))}{idOf(p) === myId ? ` (${t("messages.meTag")})` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className={classes.field}>
            <label className={classes.labelSmall} htmlFor={dueFieldId}>{t("workspace.dueDate")}</label>
            <input id={dueFieldId} type="date" className={classes.input} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
        </div>
        <button type="submit" className={classes.primaryBtn} disabled={!title.trim() || busy}>
          <Plus size={16} aria-hidden="true" /> {t("workspace.add")}
        </button>
      </form>

      {ws.tasks.length === 0 ? (
        <p className={classes.empty}>{t("workspace.tasksEmpty")}</p>
      ) : (
        <>
          <p className={classes.progress}>{t("workspace.tasksProgress", { done: done.length, total: ws.tasks.length })}</p>
          {open.length > 0 && <ul className={classes.list}>{open.map(renderTask)}</ul>}
          {done.length > 0 && (
            <details className={classes.section}>
              <summary className={classes.summary}>{t("workspace.doneSection", { count: done.length })}</summary>
              <ul className={classes.list}>{done.map(renderTask)}</ul>
            </details>
          )}
        </>
      )}
    </>
  );
}

/* ── Agenda ─────────────────────────────────────────────────────────────── */
const RSVP = ["yes", "maybe", "no"];
const RSVP_LABEL = { yes: "workspace.rsvpYes", maybe: "workspace.rsvpMaybe", no: "workspace.rsvpNo" };
const PAST_AFTER_MS = 3 * 3600 * 1000; // un rendez-vous reste « à venir » 3 h après son début

function AgendaTab({ ws, myId, isOwner }) {
  const { t } = useTranslation();
  const fmt = useFormatters();
  const [title, setTitle] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [location, setLocation] = useState("");
  const [busy, setBusy] = useState(false);
  const titleId = useId();
  const whenId = useId();
  const whereId = useId();

  const now = Date.now();
  const isPast = (ev) => new Date(ev.startsAt).getTime() < now - PAST_AFTER_MS;
  const upcoming = ws.events.filter((ev) => !isPast(ev));
  const past = ws.events.filter(isPast).reverse();
  const canDelete = (ev) => isOwner || idOf(ev.createdBy) === myId;

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !startsAt || busy) return;
    setBusy(true);
    const ok = await ws.addEvent({ title: title.trim(), startsAt: new Date(startsAt).toISOString(), location: location.trim() });
    setBusy(false);
    if (ok) { setTitle(""); setStartsAt(""); setLocation(""); }
  };

  const renderEvent = (ev, past) => {
    const date = new Date(ev.startsAt);
    const mine = ev.rsvps.find((r) => idOf(r.userId) === myId)?.status;
    const going = ev.rsvps.filter((r) => r.status === "yes");
    return (
      <li key={ev._id} className={`${classes.event} ${past ? classes.eventPast : ""}`}>
        <div className={classes.dateBadge} aria-hidden="true">
          <span className={classes.dateDay}>{fmt.dayNum.format(date)}</span>
          <span className={classes.dateMonth}>{fmt.month.format(date)}</span>
        </div>
        <div className={classes.eventBody}>
          <span className={classes.eventTitle}>{ev.title}</span>
          <span className={classes.eventMeta}>
            <time dateTime={ev.startsAt} title={fmt.full.format(date)}>{fmt.weekdayTime.format(date)}</time>
            {ev.location && (
              <span className={classes.eventPlace}><MapPin size={13} aria-hidden="true" />{ev.location}</span>
            )}
          </span>
          {!past && (
            <div role="group" aria-label={t("workspace.rsvpGroup", { title: ev.title })} className={classes.rsvp}>
              {RSVP.map((status) => (
                <button
                  key={status}
                  type="button"
                  aria-pressed={mine === status}
                  className={`${classes.rsvpBtn} ${mine === status ? classes.rsvpOn : ""}`}
                  onClick={() => ws.rsvp(ev, status, myId)}
                >
                  {t(RSVP_LABEL[status])}
                </button>
              ))}
            </div>
          )}
          {going.length > 0 && (
            <span className={classes.going}>
              <span className={classes.avatars} aria-hidden="true">
                {going.slice(0, 5).map((r) => <PersonAvatar key={idOf(r.userId)} user={r.userId} size={20} />)}
              </span>
              {t("workspace.going", { count: going.length })}
            </span>
          )}
        </div>
        {canDelete(ev) && (
          <button type="button" className={classes.iconBtn} onClick={() => ws.deleteEvent(ev)} aria-label={t("workspace.deleteEvent", { title: ev.title })}>
            <Trash2 size={16} aria-hidden="true" />
          </button>
        )}
      </li>
    );
  };

  return (
    <>
      <form className={classes.form} onSubmit={submit}>
        <label className={classes.label} htmlFor={titleId}>{t("workspace.newEventLabel")}</label>
        <input
          id={titleId}
          className={classes.input}
          value={title}
          maxLength={120}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("workspace.newEventPlaceholder")}
        />
        <div className={classes.formRow}>
          <div className={classes.field}>
            <label className={classes.labelSmall} htmlFor={whenId}>{t("workspace.when")}</label>
            <input id={whenId} type="datetime-local" className={classes.input} value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          </div>
          <div className={classes.field}>
            <label className={classes.labelSmall} htmlFor={whereId}>{t("workspace.where")}</label>
            <input
              id={whereId}
              className={classes.input}
              value={location}
              maxLength={160}
              onChange={(e) => setLocation(e.target.value)}
              placeholder={t("workspace.wherePlaceholder")}
            />
          </div>
        </div>
        <button type="submit" className={classes.primaryBtn} disabled={!title.trim() || !startsAt || busy}>
          <CalendarPlus size={16} aria-hidden="true" /> {t("workspace.planEvent")}
        </button>
      </form>

      {ws.events.length === 0 ? (
        <p className={classes.empty}>{t("workspace.eventsEmpty")}</p>
      ) : (
        <>
          {upcoming.length > 0 && <ul className={classes.list}>{upcoming.map((ev) => renderEvent(ev, false))}</ul>}
          {past.length > 0 && (
            <details className={classes.section}>
              <summary className={classes.summary}>{t("workspace.pastSection", { count: past.length })}</summary>
              <ul className={classes.list}>{past.map((ev) => renderEvent(ev, true))}</ul>
            </details>
          )}
        </>
      )}
    </>
  );
}

/* ── Épinglés ───────────────────────────────────────────────────────────── */
function PinnedTab({ ws, onJump }) {
  const { t } = useTranslation();
  const fmt = useFormatters();
  if (ws.pinned.length === 0) return <p className={classes.empty}>{t("workspace.pinnedEmpty")}</p>;
  return (
    <ul className={classes.list}>
      {ws.pinned.map((msg) => (
        <li key={msg._id} className={classes.pinnedItem}>
          <span className={classes.pinnedHead}>
            <span className={classes.pinnedName} style={personStyle(msg.senderId)}>
              {getUserName(msg.senderId, t("messages.userFallback"))}
            </span>
            <time dateTime={msg.createdAt} className={classes.pinnedDate}>{fmt.day.format(new Date(msg.createdAt))}</time>
          </span>
          <p className={classes.pinnedText}>{msg.content}</p>
          <span className={classes.pinnedActions}>
            <button type="button" className={classes.linkBtn} onClick={() => onJump(idOf(msg))}>{t("workspace.viewMessage")}</button>
            <button type="button" className={classes.iconBtn} onClick={() => ws.unpin(msg)} aria-label={t("messages.unpin")}>
              <PinOff size={16} aria-hidden="true" />
            </button>
          </span>
        </li>
      ))}
    </ul>
  );
}

/* Espace projet d'un groupe : tâches, agenda et messages épinglés.
   Même présentation que le panneau des membres (intégré, tiroir ou feuille). */
export default function WorkspacePanel({ id, variant, convId, participants, myId, isOwner, onClose, onJump }) {
  const { t } = useTranslation();
  const ws = useWorkspace(convId);
  const [tab, setTab] = useState("tasks");
  const baseId = useId();

  const counts = {
    tasks: ws.tasks.filter((task) => !task.done).length,
    agenda: ws.events.filter((ev) => new Date(ev.startsAt).getTime() >= Date.now()).length,
    pinned: ws.pinned.length,
  };
  const labels = { tasks: t("workspace.tabTasks"), agenda: t("workspace.tabAgenda"), pinned: t("workspace.tabPinned") };

  const onTabKeyDown = (e) => {
    const index = TABS.indexOf(tab);
    let next = null;
    if (e.key === "ArrowRight") next = TABS[(index + 1) % TABS.length];
    if (e.key === "ArrowLeft") next = TABS[(index - 1 + TABS.length) % TABS.length];
    if (e.key === "Home") next = TABS[0];
    if (e.key === "End") next = TABS[TABS.length - 1];
    if (!next) return;
    e.preventDefault();
    setTab(next);
    document.getElementById(`${baseId}-tab-${next}`)?.focus();
  };

  let body;
  if (ws.status === "loading") {
    body = <div className={classes.skeleton} aria-busy="true"><span /><span /><span /></div>;
  } else if (ws.status === "error") {
    body = (
      <div className={classes.state} role="alert">
        <AlertCircle size={22} aria-hidden="true" />
        <p>{t("workspace.loadError")}</p>
        <button type="button" className={classes.secondaryBtn} onClick={ws.reload}>
          <RotateCw size={16} aria-hidden="true" /> {t("workspace.retry")}
        </button>
      </div>
    );
  } else if (tab === "tasks") {
    body = <TasksTab ws={ws} participants={participants} myId={myId} isOwner={isOwner} />;
  } else if (tab === "agenda") {
    body = <AgendaTab ws={ws} myId={myId} isOwner={isOwner} />;
  } else {
    body = <PinnedTab ws={ws} onJump={onJump} />;
  }

  return (
    <SidePanel id={id} variant={variant} title={t("workspace.title")} closeLabel={t("workspace.close")} onClose={onClose} wide>
      <div role="tablist" aria-label={t("workspace.title")} className={classes.tabs} onKeyDown={onTabKeyDown}>
        {TABS.map((key) => (
          <button
            key={key}
            id={`${baseId}-tab-${key}`}
            type="button"
            role="tab"
            aria-selected={tab === key}
            aria-controls={`${baseId}-panel`}
            tabIndex={tab === key ? 0 : -1}
            className={`${classes.tab} ${tab === key ? classes.tabOn : ""}`}
            onClick={() => setTab(key)}
          >
            {labels[key]}
            {ws.status === "ready" && counts[key] > 0 && <span className={classes.count}>{counts[key]}</span>}
          </button>
        ))}
      </div>
      {ws.actionError && (
        <div className={classes.actionError} role="alert">
          <AlertCircle size={16} aria-hidden="true" />
          <span>{t("workspace.errorGeneric")}</span>
        </div>
      )}
      <div id={`${baseId}-panel`} role="tabpanel" aria-labelledby={`${baseId}-tab-${tab}`} className={classes.tabPanel}>
        {body}
      </div>
    </SidePanel>
  );
}
