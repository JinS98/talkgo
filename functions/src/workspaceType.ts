import type { DocumentSnapshot } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

export function requireWorkWorkspace(workspace: DocumentSnapshot): void {
  if (!workspace.exists) throw new HttpsError('not-found', '워크스페이스를 찾을 수 없습니다.');
  const data = workspace.data();
  if (!data) throw new HttpsError('not-found', '워크스페이스를 찾을 수 없습니다.');
  const type = Object.hasOwn(data, 'type') ? data.type : 'work';
  if (type !== 'work' && type !== 'meetup') throw new HttpsError('failed-precondition', '지원하지 않는 워크스페이스 유형입니다.');
  if (type !== 'work') throw new HttpsError('failed-precondition', '업무 공간에서만 사용할 수 있는 기능입니다.');
}
