import type { Invite } from './workspaceTypes';
import styles from './WorkspaceGate.module.scss';

export function InviteList({ invites, loading, error, revokingIds, onRefresh, onRevoke }: {
  invites: Invite[]; loading: boolean; error: string; revokingIds: Set<string>;
  onRefresh: () => void; onRevoke: (inviteId: string) => void;
}) {
  return <section className={`${styles.managementCard} ${styles.wideCard}`} aria-labelledby="invites-title">
    <div className={styles.cardHeading}><h2 id="invites-title">초대 현황</h2><div className={styles.cardActions}><span>{loading ? 0 : invites.length}건</span><button type="button" onClick={onRefresh} disabled={loading}>새로고침</button></div></div>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {!error && (loading ? <p className={styles.empty}>초대 현황을 불러오는 중입니다…</p> : invites.length ? <ul className={styles.invites}>{invites.map((item) => <li key={item.inviteId}>
      <span>{item.email}<small>{item.status === 'pending' ? '대기 중' : item.status === 'accepted' ? '수락됨' : '철회됨'} · 만료 {new Date(item.expiresAt).toLocaleDateString('ko-KR')}</small></span>
      {item.status === 'pending' && <button type="button" disabled={revokingIds.has(item.inviteId)} onClick={() => onRevoke(item.inviteId)}>{revokingIds.has(item.inviteId) ? '철회 중…' : '초대 철회'}</button>}
    </li>)}</ul> : <p className={styles.empty}>아직 보낸 초대가 없습니다.</p>)}
  </section>;
}
