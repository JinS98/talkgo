import { type DocumentSnapshot, type Firestore, Timestamp } from 'firebase-admin/firestore';
import { writeReviewNotification } from './reviewNotifications.js';

const pageSize = 100;
const maxPages = 20;
const concurrency = 10;
export const reviewTimeoutActorId = 'system';

export interface ReviewTimeoutCandidate {
  taskId: string;
  reviewCycle: number;
  reviewSubmittedAt: Timestamp;
  reviewDeadlineAt: Timestamp;
}

function candidateFromSnapshot(snapshot: DocumentSnapshot): ReviewTimeoutCandidate | null {
  const reviewCycle = snapshot.get('reviewCycle');
  const reviewSubmittedAt = snapshot.get('reviewSubmittedAt');
  const reviewDeadlineAt = snapshot.get('reviewDeadlineAt');
  if (!Number.isInteger(reviewCycle) || reviewCycle < 1 || !(reviewSubmittedAt instanceof Timestamp) || !(reviewDeadlineAt instanceof Timestamp)) return null;
  return { taskId: snapshot.id, reviewCycle, reviewSubmittedAt, reviewDeadlineAt };
}

export async function completeOverdueReview(db: Firestore, candidate: ReviewTimeoutCandidate, cutoff: Timestamp): Promise<boolean> {
  const taskRef = db.doc(`tasks/${candidate.taskId}`);
  const eventRef = db.collection('taskEvents').doc();
  return db.runTransaction(async (transaction) => {
    const task = await transaction.get(taskRef);
    const deadline = task.get('reviewDeadlineAt');
    const submitted = task.get('reviewSubmittedAt');
    if (!task.exists || task.get('status') !== 'REVIEW_PENDING' || task.get('reviewRequired') !== true
      || task.get('completionReason') != null || task.get('reviewCycle') !== candidate.reviewCycle
      || !(deadline instanceof Timestamp) || !deadline.isEqual(candidate.reviewDeadlineAt)
      || !(submitted instanceof Timestamp) || !submitted.isEqual(candidate.reviewSubmittedAt)
      || deadline.toMillis() > cutoff.toMillis()) return false;

    const now = Timestamp.now();
    transaction.update(taskRef, { status: 'DONE', completionReason: 'REVIEW_TIMEOUT', reviewDeadlineAt: null, updatedAt: now });
    transaction.create(eventRef, {
      taskId: candidate.taskId,
      actorId: reviewTimeoutActorId,
      action: 'autoCompleteReview',
      createdAt: now,
      metadata: { automatic: true, completionReason: 'REVIEW_TIMEOUT', reviewCycle: candidate.reviewCycle, reviewDeadlineAt: deadline.toDate().toISOString() },
    });
    const recipients = new Set([task.get('requesterId'), task.get('assigneeId')]);
    for (const recipientId of recipients) {
      if (typeof recipientId !== 'string' || !recipientId) continue;
      writeReviewNotification(transaction, db, {
        taskId: candidate.taskId, workspaceId: task.get('workspaceId'), recipientId,
        reviewCycle: candidate.reviewCycle, type: 'REVIEW_COMPLETED', title: task.get('title'),
        at: now, completionReason: 'REVIEW_TIMEOUT',
      });
    }
    return true;
  });
}

export async function completeOverdueReviews(db: Firestore, at = new Date()): Promise<{ scanned: number; completed: number; skipped: number; failed: number; hasMore: boolean }> {
  if (!Number.isFinite(at.getTime())) throw new RangeError('올바른 검수 확인 시각이 필요합니다.');
  const cutoff = Timestamp.fromDate(at);
  let cursor: DocumentSnapshot | undefined;
  const result = { scanned: 0, completed: 0, skipped: 0, failed: 0, hasMore: false };
  const errors: unknown[] = [];
  for (let page = 0; page < maxPages; page += 1) {
    let query = db.collection('tasks').where('status', '==', 'REVIEW_PENDING')
      .where('reviewDeadlineAt', '<=', cutoff).orderBy('reviewDeadlineAt').limit(pageSize);
    if (cursor) query = query.startAfter(cursor);
    const snapshot = await query.get();
    if (snapshot.empty) break;
    result.scanned += snapshot.size;
    cursor = snapshot.docs.at(-1);
    for (let index = 0; index < snapshot.size; index += concurrency) {
      const group = snapshot.docs.slice(index, index + concurrency);
      const settled = await Promise.allSettled(group.map(async (doc) => {
        const candidate = candidateFromSnapshot(doc);
        return candidate ? completeOverdueReview(db, candidate, cutoff) : false;
      }));
      for (const item of settled) {
        if (item.status === 'rejected') { result.failed += 1; errors.push(item.reason); }
        else if (item.value) result.completed += 1;
        else result.skipped += 1;
      }
    }
    if (snapshot.size < pageSize) break;
    if (page === maxPages - 1) result.hasMore = true;
  }
  if (errors.length) throw new AggregateError(errors, `검수 기한 초과 업무 ${result.failed}건을 처리하지 못했습니다.`);
  return result;
}
