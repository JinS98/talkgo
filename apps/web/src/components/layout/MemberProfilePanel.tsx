import { useEffect, useRef } from 'react';
import type { WorkspaceMember } from '../../features/chat/useWorkspaceConversations';
import styles from './MemberProfilePanel.module.scss';

export function MemberProfilePanel({ member, viewerId, pending, error, onClose, onMessage }: {
  member: WorkspaceMember;
  viewerId: string;
  pending: boolean;
  error: string;
  onClose: () => void;
  onMessage: (member: WorkspaceMember) => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    return () => returnFocus.current?.focus();
  }, []);

  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onEscape);
    return () => document.removeEventListener('keydown', onEscape);
  }, [onClose]);

  return <aside className={styles.panel} aria-labelledby="member-profile-title">
    <div className={styles.header}><h2 id="member-profile-title">프로필</h2><button ref={closeRef} type="button" aria-label="프로필 닫기" onClick={onClose}>×</button></div>
    <div className={styles.content}>
      <div className={styles.avatar} aria-hidden="true">{member.displayName.charAt(0).toUpperCase()}</div>
      <h3>{member.displayName}{member.uid === viewerId && <span>나</span>}</h3>
      <p className={styles.role}>{member.role === 'owner' ? '워크스페이스 장' : '멤버'}{member.title && ` · ${member.title}`}</p>
      {member.uid !== viewerId && <button className={styles.messageButton} type="button" disabled={pending} onClick={() => onMessage(member)}>{pending ? '대화 여는 중…' : '메시지 보내기'}</button>}
      {error && <p className={styles.error} role="alert">{error}</p>}
      <section className={styles.details} aria-label="멤버 정보">
        {member.bio && <div><strong>소개</strong><p className={styles.bio}>{member.bio}</p></div>}
        <div><strong>이메일 주소</strong><p>{member.email}</p></div>
        {member.joinedAt?.toDate && <div><strong>참여일</strong><p>{member.joinedAt.toDate().toLocaleDateString('ko-KR')}</p></div>}
      </section>
    </div>
  </aside>;
}
