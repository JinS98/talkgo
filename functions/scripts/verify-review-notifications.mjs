import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, getDoc, getDocs, orderBy, query, where, doc } from 'firebase/firestore';
import { calculateWorkingHoursDeadline } from '../lib/reviewDeadline.js';
import { markReviewNotificationRead, notificationRef, sendReviewReminders } from '../lib/reviewNotifications.js';
import { completeOverdueReviews } from '../lib/reviewTimeout.js';
import { respondToTaskRequest } from '../lib/taskResponses.js';

assert.equal(process.env.GCLOUD_PROJECT, 'demo-taskgo');
assert.ok(process.env.FIRESTORE_EMULATOR_HOST);
const app = initializeApp({ projectId: 'demo-taskgo' }, 'review-notification-test');
const db = getFirestore(app);
const workspaceId = 'review-notification-workspace';
const requesterId = 'review-notification-requester';
const assigneeId = 'review-notification-assignee';
const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
const testEnv = await initializeTestEnvironment({ projectId: 'demo-taskgo', firestore: { host, port: Number(port), rules: readFileSync('firestore.rules', 'utf8') } });

function notification(taskId, cycle, type, recipientId) { return notificationRef(db, taskId, cycle, type, recipientId); }

async function seed(title, status, deadline = null, cycle = 0) {
  const now = Timestamp.now();
  const ref = db.collection('tasks').doc();
  await ref.set({
    workspaceId, requesterId, assigneeId, title, status,
    dueDate: Timestamp.fromMillis(Date.now() + 7 * 86400000), proposedDueDate: null,
    reviewRequired: true, reviewWorkingDays: 1, reviewCycle: cycle,
    reviewSubmittedAt: cycle ? Timestamp.fromMillis(Date.now() - 60000) : null,
    reviewDeadlineAt: deadline, reviewRejectionReason: null, completionReason: null,
    createdAt: now, updatedAt: now,
  });
  return ref;
}

try {
  await Promise.all([requesterId, assigneeId].map((uid) => db.doc(`workspaces/${workspaceId}/members/${uid}`).set({ uid, role: 'member' })));
  const task = await seed('검수 알림 시험', 'IN_PROGRESS');
  await respondToTaskRequest(db, assigneeId, { taskId: task.id, action: 'submitForReview' });
  const submitted = await notification(task.id, 1, 'REVIEW_SUBMITTED', requesterId).get();
  assert.equal(submitted.get('recipientId'), requesterId);
  assert.equal(submitted.get('readAt'), null);
  assert.equal((await notification(task.id, 1, 'REVIEW_SUBMITTED', assigneeId).get()).exists, false);

  await assert.rejects(markReviewNotificationRead(db, assigneeId, submitted.id), (error) => error.code === 'permission-denied');
  await markReviewNotificationRead(db, requesterId, submitted.id);
  const readAt = (await submitted.ref.get()).get('readAt');
  assert.ok(readAt instanceof Timestamp);
  await markReviewNotificationRead(db, requesterId, submitted.id);
  assert.ok((await submitted.ref.get()).get('readAt').isEqual(readAt));

  const requesterDb = testEnv.authenticatedContext(requesterId).firestore();
  const assigneeDb = testEnv.authenticatedContext(assigneeId).firestore();
  assert.equal((await getDoc(doc(requesterDb, 'notifications', submitted.id))).exists(), true);
  await assert.rejects(getDoc(doc(assigneeDb, 'notifications', submitted.id)), (error) => error.code === 'permission-denied');
  const ownNotices = await getDocs(query(collection(requesterDb, 'notifications'), where('recipientId', '==', requesterId), where('workspaceId', '==', workspaceId), orderBy('createdAt', 'desc')));
  assert.equal(ownNotices.size, 1);

  assert.equal((await sendReviewReminders(db)).sent, 1);
  assert.equal((await notification(task.id, 1, 'REVIEW_8H', requesterId).get()).exists, true);
  assert.equal((await sendReviewReminders(db)).sent, 0);
  const later = calculateWorkingHoursDeadline(new Date(), 7);
  assert.equal((await sendReviewReminders(db, later)).sent, 1);
  assert.equal((await notification(task.id, 1, 'REVIEW_2H', requesterId).get()).exists, true);
  assert.equal((await sendReviewReminders(db, later)).sent, 0);

  await respondToTaskRequest(db, requesterId, { taskId: task.id, action: 'rejectReview', rejectionReason: '다시 확인해 주세요.' });
  assert.equal((await sendReviewReminders(db)).sent, 0);
  await respondToTaskRequest(db, assigneeId, { taskId: task.id, action: 'resubmitForReview' });
  assert.equal((await notification(task.id, 2, 'REVIEW_SUBMITTED', requesterId).get()).exists, true);
  assert.equal((await sendReviewReminders(db)).sent, 1);
  assert.equal((await notification(task.id, 2, 'REVIEW_8H', requesterId).get()).exists, true);
  await respondToTaskRequest(db, requesterId, { taskId: task.id, action: 'approveReview' });
  assert.equal((await notification(task.id, 2, 'REVIEW_COMPLETED', assigneeId).get()).get('completionReason'), 'APPROVED');
  assert.equal((await sendReviewReminders(db)).sent, 0);

  const expired = await seed('자동 완료 알림 시험', 'REVIEW_PENDING', Timestamp.fromMillis(Date.now() - 60000), 1);
  assert.equal((await completeOverdueReviews(db)).completed, 1);
  for (const uid of [requesterId, assigneeId]) {
    assert.equal((await notification(expired.id, 1, 'REVIEW_COMPLETED', uid).get()).get('completionReason'), 'REVIEW_TIMEOUT');
  }
  assert.equal((await completeOverdueReviews(db)).completed, 0);
  assert.equal((await db.collection('notifications').where('taskId', '==', expired.id).get()).size, 2);
  await db.doc(`workspaces/${workspaceId}/members/${assigneeId}`).delete();
  const assigneeCompletion = notification(expired.id, 1, 'REVIEW_COMPLETED', assigneeId);
  await assert.rejects(markReviewNotificationRead(db, assigneeId, assigneeCompletion.id), (error) => error.code === 'permission-denied');
  await assert.rejects(getDoc(doc(assigneeDb, 'notifications', assigneeCompletion.id)), (error) => error.code === 'permission-denied');
  console.log('PASS: submission, 8h/2h reminders, cycle deduplication, completion, recipient rules, and read permissions.');
} finally {
  await testEnv.cleanup();
  await deleteApp(app);
}
