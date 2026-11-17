import type { EventInput } from '@fullcalendar/react';

export type CalendarFilter = 'team' | 'mine' | 'review';

export interface CalendarTaskInput {
  id: string;
  title: string;
  status: string;
  assigneeId: string;
  requesterId: string;
  reviewRequired: boolean;
  reviewCycle: number;
  createdAt: Date;
  dueDate: Date;
  proposedDueDate?: Date | null;
  reviewSubmittedAt?: Date | null;
  reviewDeadlineAt?: Date | null;
}

export interface CalendarMeetingInput {
  id: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
}

export function koreanDateKey(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

export function canProposeCalendarDue(task: Pick<CalendarTaskInput, 'assigneeId' | 'status'> & { proposedDueDate?: unknown }, viewerId: string): boolean {
  return task.assigneeId === viewerId && task.proposedDueDate == null
    && (task.status === 'REQUESTED' || task.status === 'ACCEPTED' || task.status === 'IN_PROGRESS');
}

export function shiftedCalendarDueDate(originalDue: Date, previousExclusiveEnd: string, nextExclusiveEnd: string): Date | null {
  const parseDay = (value: string): number | null => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const millis = Date.parse(`${value}T00:00:00.000Z`);
    return Number.isFinite(millis) && new Date(millis).toISOString().slice(0, 10) === value ? millis : null;
  };
  const previous = parseDay(previousExclusiveEnd);
  const next = parseDay(nextExclusiveEnd);
  if (!Number.isFinite(originalDue.getTime()) || previous === null || next === null || previous === next
    || previousExclusiveEnd !== nextKoreanDateKey(koreanDateKey(originalDue))) return null;
  return new Date(originalDue.getTime() + next - previous);
}

function nextKoreanDateKey(key: string): string {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
}

function dateRange(start: Date, end: Date): { start: string; end: string } | null {
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end < start) return null;
  const first = koreanDateKey(start);
  const last = koreanDateKey(end);
  return { start: first, end: nextKoreanDateKey(last) };
}

export function buildCalendarEvents(tasks: CalendarTaskInput[], meetings: CalendarMeetingInput[], filter: CalendarFilter, viewerId: string): EventInput[] {
  const events: EventInput[] = [];
  for (const task of tasks) {
    if (task.status === 'DECLINED' || filter === 'mine' && task.assigneeId !== viewerId
      || filter === 'review' && (!task.reviewRequired || task.requesterId !== viewerId)) continue;
    const reviewRange = task.status === 'REVIEW_PENDING' && task.reviewSubmittedAt && task.reviewDeadlineAt
      ? dateRange(task.reviewSubmittedAt, task.reviewDeadlineAt) : null;
    const taskRange = dateRange(task.createdAt, task.dueDate);
    if (taskRange && (filter !== 'review' || !reviewRange)) {
      events.push({ id: `task:${task.id}`, title: task.title, allDay: true, editable: canProposeCalendarDue(task, viewerId), ...taskRange,
        extendedProps: { kind: 'task', taskId: task.id, status: task.status, startsAt: task.createdAt.toISOString(), endsAt: task.dueDate.toISOString() } });
    }
    if (reviewRange && filter !== 'mine') {
      events.push({ id: `review:${task.id}:${task.reviewCycle}`, title: `검수 · ${task.title}`, allDay: true, editable: false, ...reviewRange,
        extendedProps: { kind: 'review', taskId: task.id, status: task.status, startsAt: task.reviewSubmittedAt!.toISOString(), endsAt: task.reviewDeadlineAt!.toISOString() } });
    }
  }
  if (filter === 'team') for (const meeting of meetings) {
    if (!Number.isFinite(meeting.startsAt.getTime()) || !Number.isFinite(meeting.endsAt.getTime()) || meeting.endsAt <= meeting.startsAt) continue;
    events.push({ id: `meeting:${meeting.id}`, title: `회의 · ${meeting.title}`, allDay: false, editable: false,
      start: meeting.startsAt.toISOString(), end: meeting.endsAt.toISOString(),
      extendedProps: { kind: 'meeting', meetingId: meeting.id, startsAt: meeting.startsAt.toISOString(), endsAt: meeting.endsAt.toISOString() } });
  }
  return events;
}
