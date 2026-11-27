export type WorkspaceType = 'work' | 'meetup';

export function readWorkspaceType(data: Record<string, unknown> | undefined): WorkspaceType {
  if (!data) throw new Error('워크스페이스를 찾을 수 없거나 접근 권한이 없습니다.');
  if (!Object.hasOwn(data, 'type')) return 'work';
  if (data.type === 'work' || data.type === 'meetup') return data.type;
  throw new Error('지원하지 않는 워크스페이스 유형입니다. 관리자에게 문의해 주세요.');
}
