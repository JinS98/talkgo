import assert from 'node:assert/strict';
import { createMeetingRecord } from '../lib/meetingModel.js';

const request = () => ({ workspaceId: 'team-1', title: '주간 회의', startsAt: new Date(Date.now() + 3_600_000).toISOString(), endsAt: new Date(Date.now() + 7_200_000).toISOString() });
let saved;
let memberExists = false;
const db = {
  collection: name => { assert.equal(name, 'meetings'); return { doc: () => ({ id: 'meeting-1' }) }; },
  doc: path => ({ path }),
  runTransaction: async callback => callback({
    get: async ref => { assert.equal(ref.path, 'workspaces/team-1/members/member-1'); return { exists: memberExists }; },
    create: (ref, data) => { assert.equal(ref.id, 'meeting-1'); saved = data; },
  }),
};
await assert.rejects(createMeetingRecord(db, 'member-1', request()), { code: 'permission-denied' });
assert.equal(saved, undefined);
memberExists = true;
await assert.rejects(createMeetingRecord(db, 'member-1', { ...request(), endsAt: new Date(Date.now() + 26 * 3_600_000).toISOString() }), { code: 'invalid-argument' });
await assert.rejects(createMeetingRecord(db, 'member-1', { ...request(), extra: true }), { code: 'invalid-argument' });
await assert.rejects(createMeetingRecord(db, 'member-1', { ...request(), startsAt: '2026-99-99T00:00:00.000Z' }), { code: 'invalid-argument' });
assert.deepEqual(await createMeetingRecord(db, 'member-1', request()), { meetingId: 'meeting-1' });
assert.equal(saved.title, '주간 회의');
assert.equal(saved.createdById, 'member-1');
assert.ok(saved.endsAt.toMillis() > saved.startsAt.toMillis());
console.log('PASS: meeting input, member authorization, and persisted fields.');
