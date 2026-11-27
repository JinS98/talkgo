import { type Firestore, Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { requireWorkWorkspace } from './workspaceType.js';

const idPattern = /^[A-Za-z0-9_-]{1,128}$/;
const isoPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function parseIso(value: unknown): number {
  if (typeof value !== 'string' || !isoPattern.test(value)) throw new HttpsError('invalid-argument', '회의 날짜와 시간을 확인해 주세요.');
  const millis = Date.parse(value);
  if (!Number.isFinite(millis) || new Date(millis).toISOString() !== value) throw new HttpsError('invalid-argument', '회의 날짜와 시간을 확인해 주세요.');
  return millis;
}

export async function createMeetingRecord(db: Firestore, creatorId: string, value: unknown): Promise<{ meetingId: string }> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpsError('invalid-argument', '회의 정보를 확인해 주세요.');
  const data = value as Record<string, unknown>;
  if (Object.keys(data).length !== 4 || !['workspaceId', 'title', 'startsAt', 'endsAt'].every((key) => key in data)
    || typeof data.workspaceId !== 'string' || !idPattern.test(data.workspaceId)) {
    throw new HttpsError('invalid-argument', '회의 필드와 워크스페이스를 확인해 주세요.');
  }
  if (typeof data.title !== 'string' || data.title.trim().length < 2 || data.title.trim().length > 120) {
    throw new HttpsError('invalid-argument', '회의 제목은 2~120자로 입력해 주세요.');
  }
  const start = parseIso(data.startsAt);
  const end = parseIso(data.endsAt);
  if (start <= Date.now() || end <= start || end - start > 24 * 60 * 60 * 1000) {
    throw new HttpsError('invalid-argument', '미래의 시작 시각과 24시간 이내 종료 시각을 선택해 주세요.');
  }
  const title = data.title as string;
  const meetingRef = db.collection('meetings').doc();
  await db.runTransaction(async (transaction) => {
    const workspace = await transaction.get(db.doc(`workspaces/${data.workspaceId}`));
    const member = await transaction.get(db.doc(`workspaces/${data.workspaceId}/members/${creatorId}`));
    if (!member.exists) throw new HttpsError('permission-denied', '워크스페이스 멤버만 회의를 등록할 수 있습니다.');
    requireWorkWorkspace(workspace);
    const now = Timestamp.now();
    transaction.create(meetingRef, {
      workspaceId: data.workspaceId, title: title.trim(), createdById: creatorId,
      startsAt: Timestamp.fromMillis(start), endsAt: Timestamp.fromMillis(end), createdAt: now, updatedAt: now,
    });
  });
  return { meetingId: meetingRef.id };
}
