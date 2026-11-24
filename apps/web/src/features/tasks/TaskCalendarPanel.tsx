import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/react/daygrid';
import interactionPlugin from '@fullcalendar/react/interaction';
import classicThemePlugin from '@fullcalendar/react/themes/classic';
import koLocale from '@fullcalendar/react/locales/ko';
import type { CalendarRef, EventDisplayInfo, EventDropInfo, EventResizeDoneInfo, MountInfo } from '@fullcalendar/react';
import '@fullcalendar/react/skeleton.css';
import '@fullcalendar/react/themes/classic/theme.css';
import '@fullcalendar/react/themes/classic/palette.css';
import { getIdToken, type Auth } from 'firebase/auth';
import { collection, onSnapshot, query, Timestamp, where, type Firestore } from 'firebase/firestore';
import { httpsCallable, type Functions } from 'firebase/functions';
import type { WorkspaceTaskState } from './useWorkspaceTasks';
import { buildCalendarEvents, canProposeCalendarDue, koreanDateKey, shiftedCalendarDueDate, type CalendarFilter } from './calendarEvents';
import { respondTask, taskResponseError } from './taskResponseApi';
import { useModalDialog } from '../../hooks/useModalDialog';
import styles from './TaskCalendarPanel.module.scss';

type MeetingRecord = { id: string; title: string; startsAt: Timestamp; endsAt: Timestamp };
type DueProposalDraft = { taskId: string; dueLocal: string };
const calendarPlugins = [dayGridPlugin, interactionPlugin, classicThemePlugin];
const filters: { id: CalendarFilter; label: string }[] = [
  { id: 'team', label: '팀 전체 일정' }, { id: 'mine', label: '내 담당 업무' }, { id: 'review', label: '내가 검수할 업무' },
];
const filterDescriptions: Record<CalendarFilter, string> = {
  team: '팀의 업무, 검수 기한, 회의를 함께 표시합니다.',
  mine: '내가 담당자로 지정된 업무의 요청일부터 마감일까지 표시합니다.',
  review: '내가 요청한 검수 대상 업무를 표시합니다. 검수 대기 중에는 제출일부터 검수 기한까지 표시합니다.',
};
const dateTime = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short' });
function inputValue(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
function eventTitle(info: MountInfo<EventDisplayInfo>) {
  const { startsAt, endsAt } = info.event.extendedProps as { startsAt?: string; endsAt?: string };
  if (startsAt && endsAt) info.el.title = `${info.event.title} · ${dateTime.format(new Date(startsAt))} ~ ${dateTime.format(new Date(endsAt))}`;
}

export function TaskCalendarPanel({ auth, db, functions, workspaceId, viewerId, taskState }: { auth: Auth; db: Firestore; functions: Functions; workspaceId: string; viewerId: string; taskState: WorkspaceTaskState }) {
  const calendarRef = useRef<CalendarRef>(null);
  const [month, setMonth] = useState(() => koreanDateKey(new Date()).slice(0, 7));
  const [filter, setFilter] = useState<CalendarFilter>('team');
  const [meetings, setMeetings] = useState<MeetingRecord[]>([]);
  const [meetingsLoaded, setMeetingsLoaded] = useState(false);
  const [meetingLoadError, setMeetingLoadError] = useState('');
  const [meetingOpen, setMeetingOpen] = useState(false);
  const [meetingTitle, setMeetingTitle] = useState('');
  const [meetingStart, setMeetingStart] = useState(() => inputValue(new Date(Date.now() + 60 * 60_000)));
  const [meetingEnd, setMeetingEnd] = useState(() => inputValue(new Date(Date.now() + 2 * 60 * 60_000)));
  const [meetingError, setMeetingError] = useState('');
  const [meetingPending, setMeetingPending] = useState(false);
  const [dueProposal, setDueProposal] = useState<DueProposalDraft | null>(null);
  const [dueProposalError, setDueProposalError] = useState('');
  const [dueProposalPending, setDueProposalPending] = useState(false);
  const [respondingTaskIds, setRespondingTaskIds] = useState<Set<string>>(() => new Set());
  const [responseError, setResponseError] = useState<{ taskId: string; message: string } | null>(null);
  const [actionNotice, setActionNotice] = useState('');
  const dialogRef = useModalDialog(meetingOpen);
  const proposalDialogRef = useModalDialog(Boolean(dueProposal));

  const { tasks, loading: tasksLoading, error: taskLoadError } = taskState;
  useEffect(() => onSnapshot(query(collection(db, 'meetings'), where('workspaceId', '==', workspaceId)), snapshot => {
    setMeetings(snapshot.docs.map(item => ({ ...item.data() as Omit<MeetingRecord, 'id'>, id: item.id })));
    setMeetingsLoaded(true);
    setMeetingLoadError('');
  }, () => { setMeetingsLoaded(true); setMeetingLoadError('회의 일정을 불러오지 못했습니다. 연결 상태를 확인해 주세요.'); }), [db, workspaceId]);

  const events = useMemo(() => buildCalendarEvents(tasks.filter(task => task.createdAt instanceof Timestamp && task.dueDate instanceof Timestamp).map(task => ({
    id: task.id, title: task.title, status: task.status, assigneeId: task.assigneeId, requesterId: task.requesterId,
    reviewRequired: task.reviewRequired, reviewCycle: task.reviewCycle, createdAt: task.createdAt.toDate(), dueDate: task.dueDate.toDate(),
    proposedDueDate: task.proposedDueDate instanceof Timestamp ? task.proposedDueDate.toDate() : null,
    reviewSubmittedAt: task.reviewSubmittedAt instanceof Timestamp ? task.reviewSubmittedAt.toDate() : null,
    reviewDeadlineAt: task.reviewDeadlineAt instanceof Timestamp ? task.reviewDeadlineAt.toDate() : null,
  })), meetings.filter(meeting => meeting.startsAt instanceof Timestamp && meeting.endsAt instanceof Timestamp).map(meeting => ({
    id: meeting.id, title: meeting.title, startsAt: meeting.startsAt.toDate(), endsAt: meeting.endsAt.toDate(),
  })), filter, viewerId), [tasks, meetings, filter, viewerId]);
  const loading = tasksLoading || filter === 'team' && !meetingsLoaded;
  const loadError = taskLoadError || filter === 'team' && meetingLoadError;
  const draftTask = dueProposal ? tasks.find(task => task.id === dueProposal.taskId) : undefined;
  const pendingRequests = tasks.filter(task => task.requesterId === viewerId && task.proposedDueDate instanceof Timestamp
    && (task.status === 'REQUESTED' || task.status === 'ACCEPTED' || task.status === 'IN_PROGRESS'));

  function startDueProposal(info: Pick<EventDropInfo, 'event' | 'oldEvent' | 'revert'> | Pick<EventResizeDoneInfo, 'event' | 'oldEvent' | 'revert'>) {
    const nextEnd = info.event.endStr;
    const previousEnd = info.oldEvent.endStr;
    const taskId = info.event.extendedProps.taskId as string | undefined;
    info.revert();
    const task = tasks.find(item => item.id === taskId);
    if (!task || !(task.dueDate instanceof Timestamp) || !canProposeCalendarDue(task, viewerId)) return;
    const candidate = shiftedCalendarDueDate(task.dueDate.toDate(), previousEnd, nextEnd);
    if (!candidate) return;
    setActionNotice('');
    setDueProposalError('');
    setDueProposal({ taskId: task.id, dueLocal: inputValue(candidate) });
  }

  async function submitDueProposal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dueProposal || !draftTask || dueProposalPending) return;
    const candidate = new Date(dueProposal.dueLocal);
    if (!Number.isFinite(candidate.getTime()) || candidate <= new Date() || candidate.getTime() === draftTask.dueDate.toMillis()) {
      setDueProposalError('현재 마감과 다른 미래의 날짜·시간을 선택해 주세요.'); return;
    }
    if (!canProposeCalendarDue(draftTask, viewerId)) {
      setDueProposalError('업무 상태가 변경됐습니다. 현재 일정을 확인해 주세요.'); return;
    }
    setDueProposalPending(true);
    setDueProposalError('');
    try {
      await respondTask(auth, functions, { taskId: draftTask.id, action: 'proposeDueDate', proposedDueDate: candidate.toISOString() });
      setDueProposal(null);
      setActionNotice('마감 변경을 제안했습니다. 요청자가 승인할 때까지 기존 마감일이 유지됩니다.');
    } catch (cause) {
      setDueProposalError(taskResponseError(cause));
    } finally { setDueProposalPending(false); }
  }

  async function respondToDueProposal(taskId: string, action: 'approveDueDate' | 'rejectDueDate') {
    if (respondingTaskIds.has(taskId)) return;
    setRespondingTaskIds(current => new Set(current).add(taskId));
    setResponseError(null);
    setActionNotice('');
    try {
      await respondTask(auth, functions, { taskId, action });
      setActionNotice(action === 'approveDueDate' ? '마감 변경을 승인했습니다.' : '마감 변경 제안을 거절했습니다.');
    } catch (cause) {
      setResponseError({ taskId, message: taskResponseError(cause) });
    } finally { setRespondingTaskIds(current => { const next = new Set(current); next.delete(taskId); return next; }); }
  }

  async function submitMeeting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (meetingPending) return;
    const start = new Date(meetingStart);
    const end = new Date(meetingEnd);
    if (!meetingTitle.trim() || !Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start <= new Date() || end <= start || end.getTime() - start.getTime() > 86_400_000) {
      setMeetingError('미래의 시작 시각과 24시간 이내 종료 시각을 확인해 주세요.'); return;
    }
    setMeetingPending(true); setMeetingError('');
    try {
      if (!auth.currentUser) throw new Error('다시 로그인해 주세요.');
      await getIdToken(auth.currentUser, true);
      await httpsCallable(functions, 'createMeeting')({ workspaceId, title: meetingTitle.trim(), startsAt: start.toISOString(), endsAt: end.toISOString() });
      setMeetingOpen(false); setMeetingTitle('');
    } catch (reason) {
      const code = reason && typeof reason === 'object' && 'code' in reason ? String(reason.code) : '';
      setMeetingError(code === 'functions/permission-denied' ? '워크스페이스 멤버만 회의를 등록할 수 있습니다.' : code === 'functions/unauthenticated' ? '다시 로그인해 주세요.' : code === 'functions/invalid-argument' ? '회의 제목과 날짜를 확인해 주세요.' : '회의를 등록하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    } finally { setMeetingPending(false); }
  }
  function openMeeting() {
    if (new Date(meetingStart) <= new Date()) {
      setMeetingStart(inputValue(new Date(Date.now() + 60 * 60_000)));
      setMeetingEnd(inputValue(new Date(Date.now() + 2 * 60 * 60_000)));
    }
    setMeetingError('');
    setMeetingOpen(true);
  }

  return <section className={styles.calendarView} aria-labelledby="calendar-title">
    <div className={styles.heading}><p className={styles.eyebrow}>SCHEDULE</p><h1 id="calendar-title">캘린더</h1><p>업무 요청일부터 마감일까지, 검수 기한과 회의까지 한눈에 확인하세요.</p></div>
    <div className={styles.controls}>
      <div className={styles.monthControl}><button type="button" aria-label="이전 달" onClick={() => calendarRef.current?.getApi().prev()}>‹</button><strong aria-live="polite">{Number(month.slice(0, 4))}년 {Number(month.slice(5))}월</strong><button type="button" aria-label="다음 달" onClick={() => calendarRef.current?.getApi().next()}>›</button></div>
      <div className={styles.controlRight}><div className={styles.filters} role="group" aria-label="일정 필터">{filters.map(item => <button key={item.id} type="button" aria-pressed={filter === item.id} className={filter === item.id ? styles.selected : ''} onClick={() => setFilter(item.id)}>{item.label}</button>)}</div><button className={styles.addMeeting} type="button" onClick={openMeeting}>회의 추가</button></div>
    </div>
    <p className={styles.filterDescription}>{filterDescriptions[filter]}</p>
    <p className={styles.dragHint}>담당자는 업무 바를 옮기거나 끝을 드래그해 새 마감을 제안할 수 있습니다. 요청자가 승인하면 확정됩니다.</p>
    {actionNotice && <p role="status" className={styles.actionNotice}>{actionNotice}</p>}
    {pendingRequests.length > 0 && <section className={styles.pendingRequests} aria-label="받은 마감 변경 제안">
      <h2>받은 마감 변경 제안</h2>
      {pendingRequests.map(task => <article key={task.id} className={styles.pendingRequest}>
        <strong>{task.title}</strong>
        <span>현재 마감 {dateTime.format(task.dueDate.toDate())} → 제안 {task.proposedDueDate instanceof Timestamp ? dateTime.format(task.proposedDueDate.toDate()) : ''}</span>
        <div><button type="button" disabled={respondingTaskIds.has(task.id)} onClick={() => void respondToDueProposal(task.id, 'approveDueDate')}>변경 승인</button><button type="button" disabled={respondingTaskIds.has(task.id)} onClick={() => void respondToDueProposal(task.id, 'rejectDueDate')}>변경 거절</button></div>
        {responseError?.taskId === task.id && <p role="alert" className={styles.error}>{responseError.message}</p>}
      </article>)}
    </section>}
    {loadError && <p role="alert" className={styles.error}>{loadError}</p>}
    {loading && <p role="status" className={styles.loading}>일정을 불러오는 중…</p>}
    {!loading && !loadError && events.length === 0 && <p role="status" className={styles.empty}>선택한 범위에 표시할 일정이 없습니다.</p>}
    <div className={styles.calendarOuter}>
      <FullCalendar ref={calendarRef} plugins={calendarPlugins} initialView="dayGridMonth" locale={koLocale} timeZone="Asia/Seoul" headerToolbar={false} fixedWeekCount={false} dayMaxEvents={3} moreLinkClick="popover" editable events={events} eventDrop={startDueProposal} eventResize={startDueProposal} datesSet={info => setMonth(koreanDateKey(info.view.calendar.getDate()).slice(0, 7))} eventDidMount={eventTitle} eventClass={info => `${styles.event} ${styles[info.event.extendedProps.kind as 'task' | 'review' | 'meeting']} ${info.event.extendedProps.status === 'REQUESTED' ? styles.pending : ''} ${info.isDraggable || info.isEndResizable ? styles.movable : ''}`} dayCellClass={styles.dayCell} dayHeaderClass={styles.dayHeader} moreLinkClass={styles.moreLink} popoverClass={styles.popover} dayHeaderFormat={{ weekday: 'short' }} />
    </div>
    <div className={styles.legend}><span>확정된 업무</span><span className={styles.pendingKey}>요청 대기 업무</span>{filter !== 'mine' && <span className={styles.reviewKey}>검수 기한</span>}{filter === 'team' && <span className={styles.meetingKey}>회의</span>}</div>
    <dialog ref={dialogRef} className={styles.meetingDialog} aria-labelledby="meeting-title" onCancel={() => setMeetingOpen(false)} onClick={event => { if (event.target === event.currentTarget) setMeetingOpen(false); }}>
      <form onSubmit={submitMeeting}><div className={styles.dialogHeading}><h2 id="meeting-title">회의 추가</h2><button type="button" aria-label="회의 추가 닫기" onClick={() => setMeetingOpen(false)}>×</button></div>
        <div className={styles.dialogBody}><label>회의 제목<input required maxLength={120} minLength={2} value={meetingTitle} onChange={event => setMeetingTitle(event.target.value)} placeholder="회의 제목" /></label><label>시작 날짜·시간<input required type="datetime-local" value={meetingStart} onChange={event => setMeetingStart(event.target.value)} /></label><label>종료 날짜·시간<input required type="datetime-local" value={meetingEnd} onChange={event => setMeetingEnd(event.target.value)} /></label>{meetingError && <p role="alert" className={styles.error}>{meetingError}</p>}</div>
        <div className={styles.dialogActions}><button type="button" onClick={() => setMeetingOpen(false)}>취소</button><button type="submit" disabled={meetingPending}>{meetingPending ? '등록 중…' : '회의 등록'}</button></div>
      </form>
    </dialog>
    <dialog ref={proposalDialogRef} className={styles.meetingDialog} aria-labelledby="due-proposal-title" onCancel={event => { if (dueProposalPending) event.preventDefault(); else setDueProposal(null); }} onClick={event => { if (event.target === event.currentTarget && !dueProposalPending) setDueProposal(null); }}>
      <form onSubmit={submitDueProposal}><div className={styles.dialogHeading}><h2 id="due-proposal-title">마감 변경 제안</h2><button type="button" aria-label="마감 변경 제안 닫기" disabled={dueProposalPending} onClick={() => setDueProposal(null)}>×</button></div>
        <div className={styles.dialogBody}>{draftTask ? <><p className={styles.draftTaskTitle}>{draftTask.title}</p><p className={styles.currentDue}>현재 마감 {dateTime.format(draftTask.dueDate.toDate())}</p><label>제안 마감 날짜·시간<input required type="datetime-local" min={inputValue(new Date())} value={dueProposal?.dueLocal ?? ''} onChange={event => setDueProposal(current => current && { ...current, dueLocal: event.target.value })} /></label><p className={styles.proposalHint}>요청자가 승인하기 전까지 현재 마감일이 유지됩니다.</p></> : <p>업무를 찾지 못했습니다. 일정을 다시 확인해 주세요.</p>}{dueProposalError && <p role="alert" className={styles.error}>{dueProposalError}</p>}</div>
        <div className={styles.dialogActions}><button type="button" disabled={dueProposalPending} onClick={() => setDueProposal(null)}>취소</button><button type="submit" disabled={dueProposalPending || !draftTask || !canProposeCalendarDue(draftTask, viewerId)}>{dueProposalPending ? '전송 중…' : '제안 보내기'}</button></div>
      </form>
    </dialog>
  </section>;
}
