import { useState, type FormEvent } from 'react';
import {
  GoogleAuthProvider,
  linkWithPopup,
  type Auth,
  type User,
} from 'firebase/auth';
import { signOutAndReset } from './authActions';
import { getAuthErrorMessage } from './authErrors';
import type { UserProfile } from './userProfile';
import styles from './AccountMenu.module.scss';

interface AccountMenuProps {
  auth: Auth;
  user: User;
  displayName: string;
  profile: UserProfile;
  onSaveName: (name: string) => Promise<void>;
  onSaveDetails: (details: Pick<UserProfile, 'title' | 'bio'>) => Promise<void>;
  onRefresh: () => Promise<void>;
}

export function AccountMenu({ auth, user, displayName, profile, onSaveName, onSaveDetails, onRefresh }: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const name = nameDraft ?? displayName;
  const [detailsDraft, setDetailsDraft] = useState<Pick<UserProfile, 'title' | 'bio'> | null>(null);
  const details = detailsDraft ?? { title: profile.title, bio: profile.bio };
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const hasGoogle = user.providerData.some(({ providerId }) => providerId === 'google.com');
  const hasPassword = user.providerData.some(({ providerId }) => providerId === 'password');

  async function run(action: () => Promise<void>, successMessage = '') {
    if (pending) return;
    setPending(true);
    setMessage('');
    setErrorMessage('');
    try {
      await action();
      setMessage(successMessage);
      await onRefresh();
    } catch (error) {
      setErrorMessage(error instanceof Error && !('code' in error) ? error.message : getAuthErrorMessage(error));
    } finally {
      setPending(false);
    }
  }

  function saveName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void run(async () => { await onSaveName(name); setNameDraft(null); }, '이름을 변경했습니다.');
  }

  function saveDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void run(async () => { await onSaveDetails(details); setDetailsDraft(null); }, '프로필 정보를 저장했습니다.');
  }

  return (
    <div className={styles.container} onKeyDown={(event) => { if (event.key === 'Escape') setOpen(false); }}>
      <button className={styles.trigger} type="button" aria-expanded={open} aria-controls="account-menu-panel" onClick={() => setOpen((value) => !value)}><span className={styles.avatar} aria-hidden="true">{displayName.charAt(0).toUpperCase()}</span><span>계정</span></button>
      {open && (
        <section className={styles.panel} id="account-menu-panel" aria-label="계정 설정">
          <p className={styles.label}>로그인한 계정</p>
          <strong className={styles.name}>{displayName}</strong>
          <strong className={styles.email}>{user.email}</strong>
          <form className={styles.nameForm} onSubmit={saveName}><label htmlFor="account-display-name">표시 이름</label><input id="account-display-name" type="text" autoComplete="name" minLength={2} maxLength={40} required value={name} onChange={(event) => setNameDraft(event.target.value)} disabled={pending} /><button className={styles.action} type="submit" disabled={pending}>이름 저장</button></form>
          <form className={styles.nameForm} onSubmit={saveDetails}>
            <label htmlFor="account-title">직책</label>
            <input id="account-title" type="text" maxLength={60} placeholder="예: 디자인 팀" value={details.title} onChange={(event) => setDetailsDraft({ ...details, title: event.target.value })} disabled={pending} />
            <label htmlFor="account-bio">소개</label>
            <textarea id="account-bio" maxLength={240} rows={3} placeholder="팀원에게 보여줄 소개를 입력하세요" value={details.bio} onChange={(event) => setDetailsDraft({ ...details, bio: event.target.value })} disabled={pending} />
            <button className={styles.action} type="submit" disabled={pending}>프로필 저장</button>
          </form>
          <p className={styles.label}>연결된 로그인 방식</p>
          <p className={styles.providers}>{[hasPassword && '이메일·비밀번호', hasGoogle && 'Google'].filter(Boolean).join(' · ') || '확인 중'}</p>

          {!hasGoogle && <button className={styles.action} type="button" disabled={pending} onClick={() => run(async () => { await linkWithPopup(user, new GoogleAuthProvider()); }, 'Google 로그인을 연결했습니다.')}>Google 로그인 연결</button>}
          {message && <p className={styles.success} role="status">{message}</p>}
          {errorMessage && <p className={styles.error} role="alert">{errorMessage}</p>}
          <button className={styles.signOut} type="button" disabled={pending} onClick={() => run(() => signOutAndReset(auth))}>로그아웃</button>
        </section>
      )}
    </div>
  );
}
