import { createHash } from 'node:crypto';
import { type Firestore, type Transaction, Timestamp } from 'firebase-admin/firestore';
import { calculateWorkingHoursDeadline } from './reviewDeadline.js';
import { HttpsError } from 'firebase-functions/v2/https';

export type ReviewNotificationType = 'REVIEW_SUBMITTED' | 'REVIEW_8H' | 'REVIEW_2H' | 'REVIEW_COMPLETED';

export function notificationRef(db: Firestore, taskId: string, cycle: number, type: ReviewNotificationType, recipientId: string) {
  const id = createHash('sha256').update(JSON.stringify([taskId, cycle, type, recipientId])).digest('hex');
  return db.doc(`notifications/${id}`);
}

export function writeReviewNotification(transaction: Transaction, db: Firestore, data: {
  taskId: string; workspaceId: string; recipientId: string; reviewCycle: number;
  type: ReviewNotificationType; title: string; at: Timestamp; completionReason?: string;
}) {
  const ref = notificationRef(db, data.taskId, data.reviewCycle, data.type, data.recipientId);
  transaction.create(ref, {
    taskId: data.taskId, workspaceId: data.workspaceId, recipientId: data.recipientId,
    reviewCycle: data.reviewCycle, type: data.type, title: data.title,
    createdAt: data.at, sentAt: data.at, readAt: null,
    ...(data.completionReason ? { completionReason: data.completionReason } : {}),
  });
}

export async function markReviewNotificationRead(db: Firestore, recipientId: string, notificationId: unknown): Promise<void> {
  if (typeof notificationId !== 'string' || !/^[a-f0-9]{64}$/.test(notificationId)) {
    throw new HttpsError('invalid-argument', '알림 ID를 확인해 주세요.');
  }
  const ref = db.doc(`notifications/${notificationId}`);
  await db.runTransaction(async (transaction) => {
    const notification = await transaction.get(ref);
    if (!notification.exists) throw new HttpsError('not-found', '알림을 찾지 못했습니다.');
    if (notification.get('recipientId') !== recipientId) throw new HttpsError('permission-denied', '본인의 알림만 확인할 수 있습니다.');
    const workspaceId = notification.get('workspaceId');
    if (typeof workspaceId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(workspaceId)
      || !(await transaction.get(db.doc(`workspaces/${workspaceId}/members/${recipientId}`))).exists) {
      throw new HttpsError('permission-denied', '현재 워크스페이스 멤버만 알림을 확인할 수 있습니다.');
    }
    if (!notification.get('readAt')) transaction.update(ref, { readAt: Timestamp.now() });
  });
}

export async function sendReviewReminders(db: Firestore, at = new Date()): Promise<{ scanned: number; sent: number; skipped: number; failed: number }> {
  if (!Number.isFinite(at.getTime())) throw new RangeError('올바른 알림 확인 시각이 필요합니다.');
  const now = Timestamp.fromDate(at);
  const twoHourCutoff = Timestamp.fromDate(calculateWorkingHoursDeadline(at, 2));
  const eightHourCutoff = Timestamp.fromDate(calculateWorkingHoursDeadline(at, 8));
  let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  const result = { scanned: 0, sent: 0, skipped: 0, failed: 0 };
  const errors: unknown[] = [];
  for (let page = 0; page < 20; page += 1) {
    let query = db.collection('tasks').where('status', '==', 'REVIEW_PENDING')
      .where('reviewDeadlineAt', '>', now).where('reviewDeadlineAt', '<=', eightHourCutoff)
      .orderBy('reviewDeadlineAt').limit(100);
    if (cursor) query = query.startAfter(cursor);
    const snapshot = await query.get();
    if (snapshot.empty) break;
    cursor = snapshot.docs.at(-1);
    for (let index = 0; index < snapshot.size; index += 10) {
      const settled = await Promise.allSettled(snapshot.docs.slice(index, index + 10).map(async (candidate) => db.runTransaction(async (transaction) => {
        const task = await transaction.get(candidate.ref);
        if (!task.exists || task.get('status') !== 'REVIEW_PENDING' || task.get('reviewRequired') !== true) return false;
        const deadline = task.get('reviewDeadlineAt');
        const submitted = task.get('reviewSubmittedAt');
        const cycle = task.get('reviewCycle');
        const requesterId = task.get('requesterId');
        const workspaceId = task.get('workspaceId');
        const title = task.get('title');
        if (!(deadline instanceof Timestamp) || !deadline.isEqual(candidate.get('reviewDeadlineAt'))
          || !(submitted instanceof Timestamp) || !submitted.isEqual(candidate.get('reviewSubmittedAt'))
          || cycle !== candidate.get('reviewCycle') || !Number.isInteger(cycle) || cycle < 1
          || typeof requesterId !== 'string' || typeof workspaceId !== 'string' || typeof title !== 'string'
          || deadline.toMillis() <= now.toMillis() || deadline.toMillis() > eightHourCutoff.toMillis()) return false;
        const type: ReviewNotificationType = deadline.toMillis() <= twoHourCutoff.toMillis() ? 'REVIEW_2H' : 'REVIEW_8H';
        const ref = notificationRef(db, candidate.id, cycle, type, requesterId);
        if ((await transaction.get(ref)).exists) return false;
        writeReviewNotification(transaction, db, { taskId: candidate.id, workspaceId, recipientId: requesterId, reviewCycle: cycle, type, title, at: now });
        return true;
      })));
      result.scanned += settled.length;
      for (const item of settled) {
        if (item.status === 'rejected') { result.failed += 1; errors.push(item.reason); }
        else if (item.value) result.sent += 1;
        else result.skipped += 1;
      }
    }
    if (snapshot.size < 100) break;
  }
  if (errors.length) throw new AggregateError(errors, `검수 리마인드 ${result.failed}건을 처리하지 못했습니다.`);
  return result;
}
