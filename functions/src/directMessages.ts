import { createHash } from 'node:crypto';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

const idPattern = /^[A-Za-z0-9_-]{1,128}$/;

export async function openDirectMessage(db: Firestore, viewerId: string, input: unknown): Promise<{ roomId: string }> {
  const data = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {};
  const workspaceId = data.workspaceId;
  const memberId = data.memberId;
  if (typeof workspaceId !== 'string' || !idPattern.test(workspaceId) || typeof memberId !== 'string' || !idPattern.test(memberId)) {
    throw new HttpsError('invalid-argument', '워크스페이스와 멤버를 확인해 주세요.');
  }
  if (memberId === viewerId) throw new HttpsError('invalid-argument', '본인과는 DM을 만들 수 없습니다.');

  const members = db.collection('workspaces').doc(workspaceId).collection('members');
  const [viewer, other] = await Promise.all([members.doc(viewerId).get(), members.doc(memberId).get()]);
  if (!viewer.exists || !other.exists) throw new HttpsError('permission-denied', '같은 워크스페이스 멤버끼리만 DM을 시작할 수 있습니다.');

  const existing = await db.collection('dmRooms').where('workspaceId', '==', workspaceId).where('participantIds', 'array-contains', viewerId).get();
  const room = existing.docs.find((item) => {
    const participants = item.get('participantIds');
    return Array.isArray(participants) && participants.length === 2 && participants.includes(memberId);
  });
  if (room) return { roomId: room.id };

  const participantIds = [viewerId, memberId].sort();
  const roomId = `dm_${createHash('sha256').update(JSON.stringify([workspaceId, ...participantIds])).digest('hex').slice(0, 32)}`;
  const roomRef = db.collection('dmRooms').doc(roomId);
  await db.runTransaction(async (transaction) => {
    const [currentViewer, currentOther, currentRoom] = await Promise.all([
      transaction.get(members.doc(viewerId)), transaction.get(members.doc(memberId)), transaction.get(roomRef),
    ]);
    if (!currentViewer.exists || !currentOther.exists) throw new HttpsError('permission-denied', '같은 워크스페이스 멤버끼리만 DM을 시작할 수 있습니다.');
    if (currentRoom.exists) {
      const participants = currentRoom.get('participantIds');
      if (currentRoom.get('workspaceId') !== workspaceId || !Array.isArray(participants)
        || participants.length !== 2 || !participantIds.every((id) => participants.includes(id))) {
        throw new HttpsError('already-exists', 'DM 방 정보를 확인할 수 없습니다.');
      }
      return;
    }
    transaction.create(roomRef, { workspaceId, participantIds, createdAt: FieldValue.serverTimestamp() });
  });
  return { roomId };
}
