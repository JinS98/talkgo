import { useEffect, useRef, useState, type FormEvent } from 'react';
import { collection, doc, onSnapshot, type Firestore } from 'firebase/firestore';
import type { Auth, User } from 'firebase/auth';
import type { Functions } from 'firebase/functions';
import { useNavigate, useSearchParams } from 'react-router';
import App from '../../App';
import { AccountMenu } from '../auth/AccountMenu';
import type { UserProfile } from '../auth/userProfile';
import { useWorkspaceNavigationStore } from '../../store/useWorkspaceNavigationStore';
import { callWorkspace, createWorkspace, workspaceCreationError, workspaceError } from './workspaceApi';
import { WorkspacePicker } from './WorkspacePicker';
import { InviteList } from './InviteList';
import type { Invite, Membership } from './workspaceTypes';
import { readWorkspaceType, type WorkspaceType } from './workspaceType';
import styles from './WorkspaceGate.module.scss';

interface Member { uid: string; email: string; displayName?: string; role: 'owner' | 'member' }

export function WorkspaceGate({ auth, user, db, functions, profile, onSaveName, onSaveDetails, onRefresh }: { auth: Auth; user: User; db: Firestore; functions: Functions; profile: UserProfile; onSaveName: (name: string) => Promise<void>; onSaveDetails: (details: Pick<UserProfile, 'title' | 'bio'>) => Promise<void>; onRefresh: () => Promise<void> }) {
  const displayName = profile.displayName;
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const selectedWorkspaceIdRef = useRef('');
  const activeView = useWorkspaceNavigationStore((state) => state.activeView);
  const setView = useWorkspaceNavigationStore((state) => state.setView);
  const [workspaces, setWorkspaces] = useState<Membership[]>([]);
  const [workspaceTypes, setWorkspaceTypes] = useState<Record<string, { type?: WorkspaceType; error?: string }>>({});
  const [workspaceTypeAttempt, setWorkspaceTypeAttempt] = useState(0);
  const [ready, setReady] = useState(false);
  const [workspaceLoadError, setWorkspaceLoadError] = useState(false);
  const [workspaceLoadAttempt, setWorkspaceLoadAttempt] = useState(0);
  const [error, setError] = useState('');
  const [inviteActionError, setInviteActionError] = useState('');
  const [createPending, setCreatePending] = useState(false);
  const [invitePending, setInvitePending] = useState(false);
  const [revokingIds, setRevokingIds] = useState<Set<string>>(() => new Set());
  const [name, setName] = useState('');
  const [newWorkspaceType, setNewWorkspaceType] = useState<WorkspaceType>('work');
  const [showCreatePage, setShowCreatePage] = useState(false);
  const [createdWorkspaceId, setCreatedWorkspaceId] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [inviteLink, setInviteLink] = useState('');
  const [linkError, setLinkError] = useState('');
  const [members, setMembers] = useState<Member[]>([]);
  const [membersWorkspaceId, setMembersWorkspaceId] = useState('');
  const [membersError, setMembersError] = useState('');
  const [invites, setInvites] = useState<Invite[]>([]);
  const [invitesWorkspaceId, setInvitesWorkspaceId] = useState('');
  const [invitesError, setInvitesError] = useState('');
  const [localLink, setLocalLink] = useState('');

  useEffect(() => onSnapshot(collection(db, 'users', user.uid, 'workspaces'), (snapshot) => {
    setWorkspaces(snapshot.docs.map((item) => ({ ...item.data() as Membership, workspaceId: item.id })));
    setWorkspaceLoadError(false);
    setReady(true);
  }, () => { setWorkspaceLoadError(true); setCreatedWorkspaceId(null); setReady(true); }), [db, user.uid, workspaceLoadAttempt]);

  const workspaceIds = JSON.stringify(workspaces.map(({ workspaceId }) => workspaceId).sort());
  useEffect(() => {
    const subscriptions = (JSON.parse(workspaceIds) as string[]).map((workspaceId) => onSnapshot(doc(db, 'workspaces', workspaceId), (snapshot) => {
      try {
        const type = readWorkspaceType(snapshot.data());
        setWorkspaceTypes((current) => ({ ...current, [workspaceId]: { type } }));
      } catch (cause) {
        setWorkspaceTypes((current) => ({ ...current, [workspaceId]: { error: cause instanceof Error ? cause.message : '워크스페이스 유형을 확인할 수 없습니다.' } }));
      }
    }, () => setWorkspaceTypes((current) => ({ ...current, [workspaceId]: { error: '워크스페이스 정보를 불러오지 못했습니다. 연결 상태와 권한을 확인해 주세요.' } }))));
    return () => subscriptions.forEach((unsubscribe) => unsubscribe());
  }, [db, workspaceIds, workspaceTypeAttempt]);

  const selected = workspaces.find(({ workspaceId }) => workspaceId === params.get('workspaceId')) ?? workspaces[0];
  const selectedWorkspaceType = selected && workspaceTypes[selected.workspaceId];

  useEffect(() => { selectedWorkspaceIdRef.current = selected?.workspaceId ?? ''; }, [selected?.workspaceId]);

  useEffect(() => {
    if (ready && selected?.role !== 'owner' && activeView === 'workspace') setView('chat');
  }, [activeView, ready, selected?.role, setView]);
  useEffect(() => {
    if (selectedWorkspaceType?.type === 'meetup' && (activeView === 'board' || activeView === 'calendar')) setView('chat');
  }, [activeView, selectedWorkspaceType?.type, setView]);

  useEffect(() => {
    if (activeView !== 'workspace' || selected?.role !== 'owner') return;
    return onSnapshot(collection(db, 'workspaces', selected.workspaceId, 'members'), (snapshot) => {
      setMembers(snapshot.docs.map((doc) => doc.data() as Member).sort((a, b) => a.role === b.role ? a.email.localeCompare(b.email) : a.role === 'owner' ? -1 : 1));
      setMembersWorkspaceId(selected.workspaceId);
      setMembersError('');
    }, () => { setMembersWorkspaceId(selected.workspaceId); setMembersError('멤버 목록을 불러오지 못했습니다.'); });
  }, [activeView, db, selected?.role, selected?.workspaceId]);

  useEffect(() => {
    if (activeView !== 'workspace' || selected?.role !== 'owner') return;
    let active = true;
    callWorkspace<{ invites: Invite[] }>(auth, functions, 'listInvites', { workspaceId: selected.workspaceId })
      .then(({ invites }) => { if (active) { setInvites(invites); setInvitesWorkspaceId(selected.workspaceId); setInvitesError(''); } })
      .catch((cause) => { if (active) { setInvitesWorkspaceId(selected.workspaceId); setInvitesError(workspaceError(cause)); } });
    return () => { active = false; };
  }, [activeView, auth, functions, selected?.role, selected?.workspaceId]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (createPending) return;
    setCreatePending(true); setError('');
    try {
      const result = await createWorkspace(auth, db, name, newWorkspaceType, profile);
      setCreatedWorkspaceId(result.workspaceId);
      setParams({ workspaceId: result.workspaceId });
      setInvitesWorkspaceId('');
      setMembersWorkspaceId('');
      setInvitesError('');
      setMembersError('');
      setName('');
      setNewWorkspaceType('work');
      setShowCreatePage(false);
    } catch (cause) { setError(workspaceCreationError(cause)); }
    finally { setCreatePending(false); }
  }

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || invitePending) return;
    const workspaceId = selected.workspaceId;
    setInvitePending(true); setInviteActionError(''); setInvitesError(''); setLocalLink('');
    try {
      const result = await callWorkspace<{ inviteId: string; link?: string }>(auth, functions, 'inviteMember', { workspaceId, email });
      setEmail('');
      const localUrl = result.link ? new URL(result.link) : null;
      if (selectedWorkspaceIdRef.current === workspaceId) setLocalLink(localUrl ? `${window.location.origin}${localUrl.pathname}${localUrl.search}` : '초대 메일을 보냈습니다.');
      try {
        const next = await callWorkspace<{ invites: Invite[] }>(auth, functions, 'listInvites', { workspaceId });
        if (selectedWorkspaceIdRef.current === workspaceId) { setInvites(next.invites); setInvitesWorkspaceId(workspaceId); }
      } catch (cause) { if (selectedWorkspaceIdRef.current === workspaceId) setInvitesError(workspaceError(cause)); }
    } catch (cause) { if (selectedWorkspaceIdRef.current === workspaceId) setInviteActionError(workspaceError(cause)); }
    finally { setInvitePending(false); }
  }

  function joinWithLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const url = new URL(inviteLink.trim(), window.location.origin);
      const token = url.searchParams.get('token');
      if (!/^\/invite\/[A-Za-z0-9]+$/.test(url.pathname) || !token || !/^[A-Za-z0-9_-]+$/.test(token)) throw new Error();
      navigate(`${url.pathname}?token=${token}`);
    } catch {
      setLinkError('초대 메일에 있는 올바른 링크를 붙여 넣어 주세요.');
    }
  }

  async function revoke(inviteId: string) {
    if (!selected || revokingIds.has(inviteId)) return;
    const workspaceId = selected.workspaceId;
    setRevokingIds((current) => new Set(current).add(inviteId)); setInviteActionError('');
    try {
      await callWorkspace(auth, functions, 'revokeInvite', { inviteId });
      if (selectedWorkspaceIdRef.current === workspaceId) setInvites((current) => current.map((item) => item.inviteId === inviteId ? { ...item, status: 'revoked' } : item));
    } catch (cause) { if (selectedWorkspaceIdRef.current === workspaceId) setInviteActionError(workspaceError(cause)); }
    finally { setRevokingIds((current) => { const next = new Set(current); next.delete(inviteId); return next; }); }
  }

  async function refreshInvites() {
    if (!selected || selected.role !== 'owner') return;
    const workspaceId = selected.workspaceId;
    setInvitesWorkspaceId('');
    setInvitesError('');
    try {
      const result = await callWorkspace<{ invites: Invite[] }>(auth, functions, 'listInvites', { workspaceId });
      if (selectedWorkspaceIdRef.current === workspaceId) setInvites(result.invites);
    } catch (cause) { if (selectedWorkspaceIdRef.current === workspaceId) setInvitesError(workspaceError(cause)); }
    finally { if (selectedWorkspaceIdRef.current === workspaceId) setInvitesWorkspaceId(workspaceId); }
  }

  function switchWorkspace(workspaceId: string) {
    if (workspaceId === selected?.workspaceId) return;
    setLocalLink('');
    setError('');
    setInviteActionError('');
    setInvitesError('');
    setMembersError('');
    setInvitesWorkspaceId('');
    setMembersWorkspaceId('');
    setView('chat');
    setParams({ workspaceId });
  }

  if (!ready) return <div className={styles.loading} role="status">워크스페이스를 불러오는 중입니다…</div>;
  if (workspaceLoadError) return <main className={styles.page}><section className={styles.card} role="alert"><h1>워크스페이스를 불러오지 못했습니다</h1><p>연결 상태와 로그인 상태를 확인한 뒤 다시 시도해 주세요.</p><button className={styles.retryButton} type="button" onClick={() => { setReady(false); setWorkspaceLoadAttempt((attempt) => attempt + 1); }}>다시 시도</button><div className={styles.emptyAccount}><AccountMenu auth={auth} user={user} displayName={displayName} profile={profile} onSaveName={onSaveName} onSaveDetails={onSaveDetails} onRefresh={onRefresh} /></div></section></main>;
  if (!selected && createdWorkspaceId) return <div className={styles.loading} role="status">워크스페이스를 준비하는 중입니다…</div>;

  if (!selected) return (
    <main className={styles.page}>
      <div className={styles.emptyWorkspace}>
        <div className={styles.emptyHeading}><p className={styles.eyebrow}>TALKGO WORKSPACE</p><h1>워크스페이스에 들어가기</h1><p>새 공간을 만들거나, 팀에서 받은 초대 링크로 참여하세요.</p></div>
        <div className={styles.emptyOptions}>
          <section className={styles.card}>
            <h2>워크스페이스 만들기</h2>
            <p>팀의 공간을 만들면 워크스페이스 장이 됩니다.</p>
            <form onSubmit={create} className={styles.form}>
              <label htmlFor="workspace-name">워크스페이스 이름</label>
              <input id="workspace-name" value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={80} required disabled={createPending} />
              <label htmlFor="workspace-type">공간 유형</label>
              <select id="workspace-type" value={newWorkspaceType} onChange={(event) => setNewWorkspaceType(event.target.value as WorkspaceType)} disabled={createPending}><option value="work">업무 공간</option><option value="meetup">모임 공간</option></select>
              <button type="submit" disabled={createPending}>{createPending ? '만드는 중…' : '만들기'}</button>
            </form>
            {error && <p className={styles.error} role="alert">{error}</p>}
          </section>
          <section className={styles.card}>
            <h2>초대로 참여하기</h2>
            <p>초대받은 이메일로 로그인한 상태입니다. 메일의 링크를 열거나 아래에 붙여 넣으세요.</p>
            <form className={styles.form} onSubmit={joinWithLink}>
              <label htmlFor="invite-link">초대 링크</label>
              <input id="invite-link" type="url" value={inviteLink} onChange={(event) => { setInviteLink(event.target.value); setLinkError(''); }} placeholder="https://…/invite/…?token=…" required />
              <button type="submit">초대 링크로 참여</button>
            </form>
            {linkError && <p className={styles.error} role="alert">{linkError}</p>}
            <p className={styles.waitingHint}>아직 초대 메일이 없다면 이 화면에서 기다려도 됩니다. 워크스페이스를 만들 필요는 없습니다.</p>
          </section>
        </div>
        <div className={styles.emptyAccount}><AccountMenu auth={auth} user={user} displayName={displayName} profile={profile} onSaveName={onSaveName} onSaveDetails={onSaveDetails} onRefresh={onRefresh} /></div>
      </div>
    </main>
  );

  if (showCreatePage) return <main className={styles.page}><section className={styles.card}>
    <p className={styles.eyebrow}>NEW WORKSPACE</p><h1>새 워크스페이스</h1><p>공간의 목적에 맞는 유형을 선택하세요. 만든 뒤에는 유형을 변경할 수 없습니다.</p>
    <form className={styles.form} onSubmit={create}>
      <label htmlFor="new-space-name">워크스페이스 이름</label><input id="new-space-name" value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={80} required disabled={createPending} />
      <label htmlFor="new-space-type">공간 유형</label><select id="new-space-type" value={newWorkspaceType} onChange={(event) => setNewWorkspaceType(event.target.value as WorkspaceType)} disabled={createPending}><option value="work">업무 공간</option><option value="meetup">모임 공간</option></select>
      <button type="submit" disabled={createPending}>{createPending ? '만드는 중…' : '새 공간 만들기'}</button>
    </form>
    {error && <p className={styles.error} role="alert">{error}</p>}
    <button className={styles.secondaryButton} type="button" onClick={() => { setShowCreatePage(false); setError(''); }}>취소</button>
    <div className={styles.emptyAccount}><AccountMenu auth={auth} user={user} displayName={displayName} profile={profile} onSaveName={onSaveName} onSaveDetails={onSaveDetails} onRefresh={onRefresh} /></div>
  </section></main>;

  if (!selectedWorkspaceType) return <div className={styles.loading} role="status">워크스페이스 유형을 확인하는 중입니다…</div>;
  if (!selectedWorkspaceType.type) return <main className={styles.page}><section className={styles.card} role="alert">
    <h1>워크스페이스를 열 수 없습니다</h1><p>{selectedWorkspaceType.error}</p>
    <WorkspacePicker selected={selected} workspaces={workspaces} types={workspaceTypes} onSelect={switchWorkspace} onCreate={() => setShowCreatePage(true)} />
    <button className={styles.retryButton} type="button" onClick={() => setWorkspaceTypeAttempt((attempt) => attempt + 1)}>다시 시도</button>
    <div className={styles.emptyAccount}><AccountMenu auth={auth} user={user} displayName={displayName} profile={profile} onSaveName={onSaveName} onSaveDetails={onSaveDetails} onRefresh={onRefresh} /></div>
  </section></main>;

  return (
    <div className={styles.shell}>
      <App auth={auth} db={db} functions={functions} workspaceId={selected.workspaceId} workspaceName={selected.name} workspaceType={selectedWorkspaceType.type} userId={user.uid} senderName={displayName} canManageWorkspace={selected.role === 'owner'} workspaceControls={
        <WorkspacePicker selected={selected} workspaces={workspaces} types={workspaceTypes} onSelect={switchWorkspace} onCreate={() => setShowCreatePage(true)} />
      } accountControls={<AccountMenu auth={auth} user={user} displayName={displayName} profile={profile} onSaveName={onSaveName} onSaveDetails={onSaveDetails} onRefresh={onRefresh} />} workspaceManagement={selected.role === 'owner' && <div className={styles.management}>
        <div className={styles.managementHeading}><p className={styles.eyebrow}>WORKSPACE</p><h1>{selected.name} 관리</h1><p>멤버와 초대 현황을 확인하고 새 멤버를 초대하세요.</p></div>
        <div className={styles.managementGrid}>
          <section className={styles.managementCard} aria-labelledby="invite-title"><div className={styles.cardHeading}><h2 id="invite-title">멤버 초대</h2></div><p className={styles.helper}>이메일 주소로 초대 링크를 보냅니다. 상대방은 같은 주소로 로그인해 수락할 수 있습니다.</p>
            <form className={styles.form} onSubmit={invite}><label htmlFor="invite-email">이메일 주소</label><input id="invite-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required disabled={invitePending} placeholder="name@example.com" /><button type="submit" disabled={invitePending}>{invitePending ? '처리 중…' : '초대 메일 보내기'}</button></form>
            {localLink && <p className={styles.localLink} role="status">{localLink.startsWith('http') ? <a href={localLink}>로컬 초대 링크</a> : localLink}</p>}
            {inviteActionError && <p className={styles.error} role="alert">{inviteActionError}</p>}
          </section>
          <section className={styles.managementCard} aria-labelledby="create-title"><div className={styles.cardHeading}><h2 id="create-title">새 워크스페이스</h2></div><p className={styles.helper}>별도의 공간을 만듭니다. 생성 후 유형은 변경할 수 없습니다.</p><form className={styles.form} onSubmit={create}><label htmlFor="new-workspace-name">워크스페이스 이름</label><input id="new-workspace-name" value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={80} required disabled={createPending} placeholder="새 워크스페이스 이름" /><label htmlFor="new-workspace-type">공간 유형</label><select id="new-workspace-type" value={newWorkspaceType} onChange={(event) => setNewWorkspaceType(event.target.value as WorkspaceType)} disabled={createPending}><option value="work">업무 공간</option><option value="meetup">모임 공간</option></select><button type="submit" disabled={createPending}>{createPending ? '만드는 중…' : '새 공간 만들기'}</button></form>{error && <p className={styles.error} role="alert">{error}</p>}</section>
          <InviteList invites={invites} loading={invitesWorkspaceId !== selected.workspaceId} error={invitesError} revokingIds={revokingIds} onRefresh={refreshInvites} onRevoke={revoke} />
          <section className={`${styles.managementCard} ${styles.wideCard}`} aria-labelledby="members-title"><div className={styles.cardHeading}><h2 id="members-title">워크스페이스 멤버</h2><span>{membersWorkspaceId === selected.workspaceId ? members.length : 0}명</span></div>
            {membersError && <p className={styles.error} role="alert">{membersError}</p>}
            {!membersError && (membersWorkspaceId === selected.workspaceId ? <ul className={styles.members}>{members.map((member) => { const name = member.displayName || `팀원-${member.uid.slice(0, 4).toUpperCase()}`; return <li key={member.uid}><span className={styles.memberAvatar} aria-hidden="true">{name.charAt(0).toUpperCase()}</span><span className={styles.memberIdentity}>{name}<small>{member.email} · {member.role === 'owner' ? '워크스페이스 장' : '멤버'}</small></span></li>; })}</ul> : <p className={styles.empty}>멤버를 불러오는 중입니다…</p>)}
          </section>
        </div>
      </div>} />
      {createdWorkspaceId === selected.workspaceId && <div className={styles.createdNotice} role="status">워크스페이스를 만들었습니다. 멤버 초대는 워크스페이스 관리에서 진행하세요.<button type="button" onClick={() => setCreatedWorkspaceId(null)}>닫기</button></div>}
    </div>
  );
}
