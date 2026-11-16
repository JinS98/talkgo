import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { completeOverdueReview, completeOverdueReviews } from '../lib/reviewTimeout.js';
import { respondToTaskRequest } from '../lib/taskResponses.js';

assert.equal(process.env.GCLOUD_PROJECT, 'demo-taskgo');
assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Run against the Firestore emulator.');
const app = initializeApp({ projectId: 'demo-taskgo' }, 'review-timeout-test');
const db = getFirestore(app);
const workspaceId = 'review-timeout-workspace';
const requesterId = 'review-timeout-requester';
const assigneeId = 'review-timeout-assignee';
const minute = 60_000;

async function seed(title, deadline, cycle = 1) {
  const now = Timestamp.now();
  const submitted = Timestamp.fromMillis(now.toMillis() - minute * 2);
  const ref = db.collection('tasks').doc();
  await ref.set({
    workspaceId, requesterId, assigneeId, title, status: 'REVIEW_PENDING',
    dueDate: Timestamp.fromMillis(now.toMillis() + minute * 60), proposedDueDate: null,
    reviewRequired: true, reviewWorkingDays: 1, reviewCycle: cycle,
    reviewSubmittedAt: submitted, reviewDeadlineAt: deadline,
    reviewRejectionReason: null, completionReason: null, createdAt: now, updatedAt: now,
  });
  return { ref, candidate: { taskId: ref.id, reviewCycle: cycle, reviewSubmittedAt: submitted, reviewDeadlineAt: deadline } };
}

async function events(taskId) {
  return (await db.collection('taskEvents').where('taskId', '==', taskId).get()).docs;
}

try {
  await db.doc(`workspaces/${workspaceId}/members/${requesterId}`).set({ uid: requesterId, role: 'member' });

  const past = Timestamp.fromMillis(Date.now() - minute);
  const future = Timestamp.fromMillis(Date.now() + minute * 60);
  const overdue = await seed('기한 초과', past);
  const notYet = await seed('아직 기한 전', future);
  const firstSweep = await completeOverdueReviews(db);
  assert.equal(firstSweep.completed, 1);
  assert.equal((await overdue.ref.get()).get('status'), 'DONE');
  assert.equal((await overdue.ref.get()).get('completionReason'), 'REVIEW_TIMEOUT');
  assert.equal((await overdue.ref.get()).get('reviewDeadlineAt'), null);
  assert.equal((await notYet.ref.get()).get('status'), 'REVIEW_PENDING');
  const timeoutEvent = (await events(overdue.ref.id))[0];
  assert.equal(timeoutEvent.get('action'), 'autoCompleteReview');
  assert.equal(timeoutEvent.get('actorId'), 'system');
  assert.equal(timeoutEvent.get('metadata.reviewCycle'), 1);
  assert.equal(timeoutEvent.get('metadata.reviewDeadlineAt'), past.toDate().toISOString());
  assert.equal((await completeOverdueReviews(db)).completed, 0);
  assert.equal((await events(overdue.ref.id)).length, 1);

  const duplicate = await seed('동시 자동 완료', past);
  const duplicated = await Promise.all([completeOverdueReview(db, duplicate.candidate, Timestamp.now()), completeOverdueReview(db, duplicate.candidate, Timestamp.now())]);
  assert.deepEqual(duplicated.sort(), [false, true]);
  assert.equal((await events(duplicate.ref.id)).length, 1);

  const stale = await seed('이전 회차 무효화', past);
  const nextSubmission = Timestamp.fromMillis(stale.candidate.reviewSubmittedAt.toMillis() + minute);
  const nextDeadline = Timestamp.fromMillis(past.toMillis() + minute / 2);
  await stale.ref.update({ reviewCycle: 2, reviewSubmittedAt: nextSubmission, reviewDeadlineAt: nextDeadline });
  assert.equal(await completeOverdueReview(db, stale.candidate, Timestamp.now()), false);
  assert.equal((await stale.ref.get()).get('status'), 'REVIEW_PENDING');
  assert.equal((await events(stale.ref.id)).length, 0);
  await completeOverdueReviews(db);
  assert.equal((await stale.ref.get()).get('completionReason'), 'REVIEW_TIMEOUT');
  assert.equal((await events(stale.ref.id))[0].get('metadata.reviewCycle'), 2);

  const late = await seed('기한 후 응답 차단', past);
  await assert.rejects(respondToTaskRequest(db, requesterId, { taskId: late.ref.id, action: 'approveReview' }), (error) => error.code === 'failed-precondition');
  await assert.rejects(respondToTaskRequest(db, requesterId, { taskId: late.ref.id, action: 'rejectReview', rejectionReason: '기한 후 반려' }), (error) => error.code === 'failed-precondition');
  await completeOverdueReviews(db);
  assert.equal((await late.ref.get()).get('completionReason'), 'REVIEW_TIMEOUT');

  for (const action of ['approveReview', 'rejectReview']) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const deadline = Timestamp.fromMillis(Date.now() + minute);
      const raced = await seed(`경합 ${action} ${attempt}`, deadline);
      const response = { taskId: raced.ref.id, action, ...(action === 'rejectReview' ? { rejectionReason: '수정 요청' } : {}) };
      const outcomes = await Promise.allSettled([
        completeOverdueReview(db, raced.candidate, Timestamp.fromMillis(deadline.toMillis() + 1)),
        respondToTaskRequest(db, requesterId, response),
      ]);
      const task = await raced.ref.get();
      const history = await events(raced.ref.id);
      assert.equal(history.length, 1, 'Exactly one terminal event is allowed.');
      assert.equal(task.get('reviewDeadlineAt'), null);
      if (history[0].get('action') === 'autoCompleteReview') {
        assert.equal(task.get('status'), 'DONE');
        assert.equal(task.get('completionReason'), 'REVIEW_TIMEOUT');
        assert.equal(outcomes[0].status, 'fulfilled');
        assert.equal(outcomes[0].value, true);
        assert.equal(outcomes[1].status, 'rejected');
      } else {
        assert.equal(history[0].get('action'), action);
        assert.equal(task.get('status'), action === 'approveReview' ? 'DONE' : 'REWORK');
        assert.equal(task.get('completionReason'), action === 'approveReview' ? 'APPROVED' : null);
        assert.equal(outcomes[0].status, 'fulfilled');
        assert.equal(outcomes[0].value, false);
        assert.equal(outcomes[1].status, 'fulfilled');
      }
    }
  }
  console.log('PASS: overdue completion, future deadline, duplicate runs, stale cycles, late replies, and approval/rejection races.');
} finally {
  await deleteApp(app);
}
