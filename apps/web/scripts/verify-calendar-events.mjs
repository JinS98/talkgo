import assert from 'node:assert/strict';
import { buildCalendarEvents, koreanDateKey } from '../src/features/tasks/calendarEvents.ts';

const date = value => new Date(value);
const task = { id: 'task-1', title: '업무', status: 'REQUESTED', assigneeId: 'member', requesterId: 'owner', reviewRequired: false, reviewCycle: 0,
  createdAt: date('2026-10-31T16:00:00.000Z'), dueDate: date('2026-11-02T12:00:00.000Z') };
const meeting = { id: 'meeting-1', title: '주간 회의', startsAt: date('2026-11-02T00:00:00.000Z'), endsAt: date('2026-11-02T01:00:00.000Z') };
assert.equal(koreanDateKey(date('2026-11-12T15:30:00.000Z')), '2026-11-13');
const team = buildCalendarEvents([task], [meeting], 'team', 'owner');
assert.deepEqual([team[0].start, team[0].end, team[0].allDay], ['2026-11-01', '2026-11-03', true], 'End is exclusive and includes the due date.');
assert.equal(team[0].extendedProps.status, 'REQUESTED');
assert.deepEqual([team[1].start, team[1].end, team[1].allDay, team[1].extendedProps.kind], [meeting.startsAt.toISOString(), meeting.endsAt.toISOString(), false, 'meeting']);
assert.equal(buildCalendarEvents([task], [meeting], 'mine', 'owner').length, 0);
assert.equal(buildCalendarEvents([task], [meeting], 'mine', 'member').length, 1);
assert.equal(buildCalendarEvents([{ ...task, status: 'DECLINED' }], [], 'team', 'owner').length, 0);
const reviewTask = { ...task, reviewRequired: true, status: 'REVIEW_PENDING', reviewCycle: 2,
  reviewSubmittedAt: date('2026-11-02T15:10:00.000Z'), reviewDeadlineAt: date('2026-11-04T14:00:00.000Z') };
const reviewEvents = buildCalendarEvents([reviewTask], [meeting], 'review', 'owner');
assert.deepEqual([reviewEvents[0].id, reviewEvents[0].start, reviewEvents[0].end], ['review:task-1:2', '2026-11-03', '2026-11-05']);
assert.equal(buildCalendarEvents([reviewTask], [], 'team', 'owner').length, 2, 'Team calendar includes task and review deadline.');
console.log('PASS: Seoul date boundaries, inclusive deadlines, filters, review ranges, and timed meetings.');
