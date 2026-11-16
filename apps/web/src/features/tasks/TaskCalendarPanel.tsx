import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/react/daygrid';
import classicThemePlugin from '@fullcalendar/react/themes/classic';
import koLocale from '@fullcalendar/react/locales/ko';
import type { CalendarRef, EventDisplayInfo, MountInfo } from '@fullcalendar/react';
import '@fullcalendar/react/skeleton.css';
import '@fullcalendar/react/themes/classic/theme.css';
import '@fullcalendar/react/themes/classic/palette.css';
import { getIdToken, type Auth } from 'firebase/auth';
import { collection, onSnapshot, query, Timestamp, where, type Firestore } from 'firebase/firestore';
import { httpsCallable, type Functions } from 'firebase/functions';
import type { TaskRecord } from '@taskgo/contracts/task';
import { buildCalendarEvents, koreanDateKey, type CalendarFilter } from './calendarEvents';
import styles from './TaskCalendarPanel.module.scss';

type CalendarTask = TaskRecord<Timestamp> & { id: string };
type MeetingRecord = { id: string; title: string; startsAt: Timestamp; endsAt: Timestamp };
const filters: { id: CalendarFilter; label: string }[] = [
  { id: 'team', label: '팀 전체 일정' }, { id: 'mine', label: '내 담당 업무' }, { id: 'review', label: '내가 검수할 업무' },
];
const dateTime = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short' });
function inputValue(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
function eventTitle(info: MountInfo<EventDisplayInfo>) {
  const { startsAt, endsAt } = info.event.extendedProps as { startsAt?: string; endsAt?: string };
  if (startsAt && endsAt) info.el.title = `${info.event.title} · ${dateTime.format(new Date(startsAt))} ~ ${dateTime.format(new Date(endsAt))}`;
}

export function TaskCalendarPanel({ auth, db, functions, workspaceId, viewerId }: { auth: Auth; db: Firestore; functions: Functions; workspaceId: string; viewerId: string }) {
  const calendarRef = useRef<CalendarRef>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [month, setMonth] = useState(() => koreanDateKey(new Date()).slice(0, 7));
  const [filter, setFilter] = useState<CalendarFilter>('team');
  const [tasks, setTasks] = useState<CalendarTask[]>([]);
  const [meetings, setMeetings] = useState<MeetingRecord[]>([]);
  const [tasksLoaded, setTasksLoaded] = useState(false);
  const [meetingsLoaded, setMeetingsLoaded] = useState(false);
  const [error, setError] = useState('');
  const [meetingOpen, setMeetingOpen] = useState(false);
  const [meetingTitle, setMeetingTitle] = useState('');
  const [meetingStart, setMeetingStart] = useState(() => inputValue(new Date(Date.now() + 60 * 60_000)));
  const [meetingEnd, setMeetingEnd] = useState(() => inputValue(new Date(Date.now() + 2 * 60 * 60_000)));
  const [meetingError, setMeetingError] = useState('');
  const [meetingPending, setMeetingPending] = useState(false);

  useEffect(() => onSnapshot(query(collection(db, 'tasks'), where('workspaceId', '==', workspaceId)), snapshot => {
    setTasks(snapshot.docs.map(item => ({ ...item.data() as TaskRecord<Timestamp>, id: item.id })));
    setTasksLoaded(true);
  }, () => { setTasksLoaded(true); setError('업무 일정을 불러오지 못했습니다. 연결 상태를 확인해 주세요.'); }), [db, workspaceId]);
  useEffect(() => onSnapshot(query(collection(db, 'meetings'), where('workspaceId', '==', workspaceId)), snapshot => {
    setMeetings(snapshot.docs.map(item => ({ ...item.data() as Omit<MeetingRecord, 'id'>, id: item.id })));
    setMeetingsLoaded(true);
  }, () => { setMeetingsLoaded(true); setError('회의 일정을 불러오지 못했습니다. 연결 상태를 확인해 주세요.'); }), [db, workspaceId]);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (meetingOpen && dialog && !dialog.open) dialog.showModal();
    if (!meetingOpen && dialog?.open) dialog.close();
    return () => { if (dialog?.open) dialog.close(); };
  }, [meetingOpen]);

  const events = useMemo(() => buildCalendarEvents(tasks.filter(task => task.createdAt instanceof Timestamp && task.dueDate instanceof Timestamp).map(task => ({
    id: task.id, title: task.title, status: task.status, assigneeId: task.assigneeId, requesterId: task.requesterId,
    reviewRequired: task.reviewRequired, reviewCycle: task.reviewCycle, createdAt: task.createdAt.toDate(), dueDate: task.dueDate.toDate(),
    reviewSubmittedAt: task.reviewSubmittedAt instanceof Timestamp ? task.reviewSubmittedAt.toDate() : null,
    reviewDeadlineAt: task.reviewDeadlineAt instanceof Timestamp ? task.reviewDeadlineAt.toDate() : null,
  })), meetings.filter(meeting => meeting.startsAt instanceof Timestamp && meeting.endsAt instanceof Timestamp).map(meeting => ({
    id: meeting.id, title: meeting.title, startsAt: meeting.startsAt.toDate(), endsAt: meeting.endsAt.toDate(),
  })), filter, viewerId), [tasks, meetings, filter, viewerId]);

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
      <div className={styles.controlRight}><div className={styles.filters} aria-label="일정 필터">{filters.map(item => <button key={item.id} type="button" aria-pressed={filter === item.id} className={filter === item.id ? styles.selected : ''} onClick={() => setFilter(item.id)}>{item.label}</button>)}</div><button className={styles.addMeeting} type="button" onClick={openMeeting}>회의 추가</button></div>
    </div>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {(!tasksLoaded || !meetingsLoaded) && <p role="status" className={styles.loading}>일정을 불러오는 중…</p>}
    <div className={styles.calendarOuter}>
      <FullCalendar ref={calendarRef} plugins={[dayGridPlugin, classicThemePlugin]} initialView="dayGridMonth" locale={koLocale} timeZone="Asia/Seoul" headerToolbar={false} fixedWeekCount={false} dayMaxEvents={3} moreLinkClick="popover" events={events} datesSet={info => setMonth(koreanDateKey(info.view.calendar.getDate()).slice(0, 7))} eventDidMount={eventTitle} eventClass={info => `${styles.event} ${styles[info.event.extendedProps.kind as 'task' | 'review' | 'meeting']} ${info.event.extendedProps.status === 'REQUESTED' ? styles.pending : ''}`} dayCellClass={styles.dayCell} dayHeaderClass={styles.dayHeader} moreLinkClass={styles.moreLink} popoverClass={styles.popover} dayHeaderFormat={{ weekday: 'short' }} />
    </div>
    <div className={styles.legend}><span>확정된 업무</span><span className={styles.pendingKey}>요청 대기 업무</span><span className={styles.reviewKey}>검수 기한</span><span className={styles.meetingKey}>회의</span></div>
    {filter === 'review' && <p className={styles.note}>검수 대기 중인 업무는 제출일부터 검수 기한까지 표시합니다.</p>}
    <dialog ref={dialogRef} className={styles.meetingDialog} aria-labelledby="meeting-title" onCancel={() => setMeetingOpen(false)} onClick={event => { if (event.target === event.currentTarget) setMeetingOpen(false); }}>
      <form onSubmit={submitMeeting}><div className={styles.dialogHeading}><h2 id="meeting-title">회의 추가</h2><button type="button" aria-label="회의 추가 닫기" onClick={() => setMeetingOpen(false)}>×</button></div>
        <div className={styles.dialogBody}><label>회의 제목<input required maxLength={120} minLength={2} value={meetingTitle} onChange={event => setMeetingTitle(event.target.value)} placeholder="회의 제목" /></label><label>시작 날짜·시간<input required type="datetime-local" value={meetingStart} onChange={event => setMeetingStart(event.target.value)} /></label><label>종료 날짜·시간<input required type="datetime-local" value={meetingEnd} onChange={event => setMeetingEnd(event.target.value)} /></label>{meetingError && <p role="alert" className={styles.error}>{meetingError}</p>}</div>
        <div className={styles.dialogActions}><button type="button" onClick={() => setMeetingOpen(false)}>취소</button><button type="submit" disabled={meetingPending}>{meetingPending ? '등록 중…' : '회의 등록'}</button></div>
      </form>
    </dialog>
  </section>;
}
