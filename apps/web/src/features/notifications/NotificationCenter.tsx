import { useEffect, useRef, useState } from 'react';
import type { Auth } from 'firebase/auth';
import { getIdToken } from 'firebase/auth';
import { collection, limit, onSnapshot, orderBy, query, Timestamp, where, type Firestore } from 'firebase/firestore';
import { httpsCallable, type Functions } from 'firebase/functions';
import { useWorkspaceNavigationStore } from '../../store/useWorkspaceNavigationStore';
import styles from './NotificationCenter.module.scss';

interface Notice {
  id: string;
  taskId: string;
  title: string;
  type: 'REVIEW_SUBMITTED' | 'REVIEW_8H' | 'REVIEW_2H' | 'REVIEW_COMPLETED';
  completionReason?: 'APPROVED' | 'NO_REVIEW' | 'REVIEW_TIMEOUT';
  createdAt: Timestamp;
  readAt: Timestamp | null;
}

function message(notice: Notice): string {
  if (notice.type === 'REVIEW_SUBMITTED') return '검수 요청이 도착했습니다.';
  if (notice.type === 'REVIEW_8H') return '검수 기한이 8근무시간 이내로 남았습니다.';
  if (notice.type === 'REVIEW_2H') return '검수 기한이 2근무시간 이내로 남았습니다.';
  if (notice.completionReason === 'REVIEW_TIMEOUT') return '검수 기한이 지나 업무가 자동 완료되었습니다.';
  if (notice.completionReason === 'APPROVED') return '검수가 승인되어 업무가 완료되었습니다.';
  return '업무가 완료되었습니다.';
}

export function NotificationCenter({ auth, db, functions, workspaceId, viewerId }: { auth: Auth; db: Firestore; functions: Functions; workspaceId: string; viewerId: string }) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pendingId, setPendingId] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const setView = useWorkspaceNavigationStore((state) => state.setView);

  useEffect(() => {
    return onSnapshot(query(collection(db, 'notifications'), where('recipientId', '==', viewerId), where('workspaceId', '==', workspaceId), orderBy('createdAt', 'desc'), limit(50)), (snapshot) => {
      setNotices(snapshot.docs.map((item) => ({ ...item.data(), id: item.id } as Notice)));
      setLoading(false);
      setError('');
    }, () => { setLoading(false); setError('알림을 불러오지 못했습니다. 다시 연결해 주세요.'); });
  }, [db, viewerId, workspaceId]);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); };
    const closeEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); buttonRef.current?.focus(); } };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeEscape);
    return () => { document.removeEventListener('pointerdown', closeOutside); document.removeEventListener('keydown', closeEscape); };
  }, [open]);

  async function read(notice: Notice) {
    if (pendingId) return;
    setPendingId(notice.id);
    setError('');
    try {
      if (!notice.readAt) {
        const user = auth.currentUser;
        if (!user) throw new Error('다시 로그인해 주세요.');
        await getIdToken(user, true);
        await httpsCallable(functions, 'markNotificationRead')({ notificationId: notice.id });
      }
      setView('board');
      setOpen(false);
    } catch { setError('알림을 확인하지 못했습니다. 다시 시도해 주세요.'); }
    finally { setPendingId(''); }
  }

  const unread = notices.filter((notice) => !notice.readAt).length;
  return <div className={styles.root} ref={rootRef}>
    <button ref={buttonRef} type="button" className={styles.trigger} aria-label={`알림${unread ? ` ${unread}개 읽지 않음` : ''}`} aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((value) => !value)}>
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4" /></svg>
      <span>알림</span>{unread > 0 && <span className={styles.count}>{unread > 9 ? '9+' : unread}</span>}
    </button>
    {open && <section className={styles.panel} role="dialog" aria-label="알림 센터">
      <div className={styles.heading}><strong>알림</strong><small>최근 50개</small></div>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {loading ? <p className={styles.empty}>알림을 불러오는 중입니다.</p> : notices.length === 0 ? <p className={styles.empty}>아직 알림이 없습니다.</p> : <ul className={styles.list}>{notices.map((notice) => <li key={notice.id}>
        <button type="button" className={`${styles.item} ${!notice.readAt ? styles.unread : ''}`} disabled={pendingId === notice.id} onClick={() => void read(notice)}>
          <span className={styles.itemTop}><strong>{notice.title}</strong>{!notice.readAt && <i aria-label="읽지 않음" />}</span>
          <span>{message(notice)}</span>
          <time dateTime={notice.createdAt?.toDate().toISOString()}>{notice.createdAt?.toDate().toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })}</time>
        </button>
      </li>)}</ul>}
    </section>}
  </div>;
}
