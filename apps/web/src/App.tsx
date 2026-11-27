import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Auth } from 'firebase/auth';
import { doc, getDocFromServer, type Firestore, type Timestamp } from 'firebase/firestore';
import type { Functions } from 'firebase/functions';
import { WorkspaceLayout } from './components/layout/WorkspaceLayout';
import { ChatPanel } from './features/chat/ChatPanel';
import { LiveChatPanel } from './features/chat/LiveChatPanel';
import { TaskBoardPanel } from './features/tasks/TaskBoardPanel';
import { NotificationCenter } from './features/notifications/NotificationCenter';
import { useWorkspaceTasks } from './features/tasks/useWorkspaceTasks';
import { defaultChannelId, type ConversationSelection } from './features/chat/demoConversations';
import { useWorkspaceConversations } from './features/chat/useWorkspaceConversations';
import type { WorkspaceMember } from './features/chat/useWorkspaceConversations';
import { callWorkspace } from './features/workspace/workspaceApi';
import type { WorkspaceType } from './features/workspace/workspaceType';
import { WorkHome, MeetupHome, MeetupProposalsPanel } from './features/workspace/WorkspaceHome';
import { useWorkspaceNavigationStore } from './store/useWorkspaceNavigationStore';
import { liveRoomKey, useLiveChatStore } from './features/chat/useLiveChatStore';
import type { TaskRecord } from '@talkgo/contracts/task';
import type { AppView } from './types/domain';
import styles from './App.module.scss';

const TaskCalendarPanel = lazy(() => import('./features/tasks/TaskCalendarPanel').then((module) => ({ default: module.TaskCalendarPanel })));

const upcomingAreas = [
  { id: 'chat', title: '채팅', description: '팀의 대화를 나누고 업무의 출발점을 만듭니다.' },
  { id: 'board', title: '업무 보드', description: '요청과 진행 상태를 한곳에서 확인합니다.' },
  { id: 'calendar', title: '팀 캘린더', description: '업무 마감과 회의 일정을 함께 살펴봅니다.' },
] satisfies { id: AppView; title: string; description: string }[];

const viewCopy: Record<'board' | 'calendar', { eyebrow: string; title: string; description: string }> = {
  board: {
    eyebrow: 'TASK BOARD',
    title: '업무 보드',
    description: '업무 요청과 진행 상황을 함께 볼 수 있는 공간입니다. 현재는 화면 미리보기입니다.',
  },
  calendar: {
    eyebrow: 'TEAM CALENDAR',
    title: '팀 캘린더',
    description: '팀의 업무 마감과 회의 일정을 한눈에 살펴보는 공간입니다. 현재는 화면 미리보기입니다.',
  },
};

export default function App({ workspaceControls, accountControls, auth, db, functions, workspaceId, workspaceName, workspaceType = 'work', userId, senderName, canManageWorkspace = false, workspaceManagement }: { workspaceControls?: ReactNode; accountControls?: ReactNode; auth?: Auth; db?: Firestore; functions?: Functions; workspaceId?: string; workspaceName?: string; workspaceType?: WorkspaceType; userId?: string; senderName?: string; canManageWorkspace?: boolean; workspaceManagement?: ReactNode }) {
  const activeView = useWorkspaceNavigationStore((state) => state.activeView);
  const selectedConversation = useWorkspaceNavigationStore((state) => state.selectedConversation);
  const setConversation = useWorkspaceNavigationStore((state) => state.setConversation);
  const selectConversation = useWorkspaceNavigationStore((state) => state.selectConversation);
  const focusedTaskId = useWorkspaceNavigationStore((state) => state.focusedTaskId);
  const focusedMessageId = useWorkspaceNavigationStore((state) => state.focusedMessageId);
  const openTask = useWorkspaceNavigationStore((state) => state.openTask);
  const openMessage = useWorkspaceNavigationStore((state) => state.openMessage);
  const setView = useWorkspaceNavigationStore((state) => state.setView);
  const liveChat = Boolean(auth && db && functions && workspaceId && userId);
  const { channels, directMessages, members, memberEmails, memberNames, error: conversationError } = useWorkspaceConversations(db, workspaceId, userId);
  const taskState = useWorkspaceTasks(db, workspaceType === 'work' ? workspaceId : undefined, userId);
  const [profileSelection, setProfileSelection] = useState<{ workspaceId: string; viewerId: string; memberId: string } | null>(null);
  const [profilePending, setProfilePending] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [openedDm, setOpenedDm] = useState<{ workspaceId: string; viewerId: string; roomId: string } | null>(null);
  const scopeRef = useRef(`${workspaceId}:${userId}`);
  const profileActionRef = useRef(0);
  useEffect(() => { scopeRef.current = `${workspaceId}:${userId}`; }, [workspaceId, userId]);
  const profileMember = profileSelection?.workspaceId === workspaceId && profileSelection?.viewerId === userId
    ? members.find((member) => member.uid === profileSelection?.memberId) ?? null : null;

  function openProfile(memberId: string) {
    if (!workspaceId || !userId || profilePending) return;
    profileActionRef.current += 1;
    setProfileSelection({ workspaceId, viewerId: userId, memberId });
    setProfileError('');
  }

  function closeProfile() {
    profileActionRef.current += 1;
    setProfileSelection(null);
  }

  useEffect(() => {
    if (liveChat && workspaceId) setConversation({ kind: 'channel', id: defaultChannelId(workspaceId), name: '전체' });
  }, [liveChat, setConversation, userId, workspaceId]);

  const defaultConversation: ConversationSelection | null = workspaceId ? { kind: 'channel', id: defaultChannelId(workspaceId), name: '전체' } : null;
  const selectedAvailable = selectedConversation.kind === 'channel'
    ? channels.some((item) => item.id === selectedConversation.id)
    : directMessages.some((item) => item.id === selectedConversation.id)
      || openedDm?.workspaceId === workspaceId && openedDm?.viewerId === userId && openedDm?.roomId === selectedConversation.id;
  const activeConversation = liveChat && !selectedAvailable && defaultConversation ? defaultConversation : selectedConversation;

  const showManagement = activeView === 'workspace' && canManageWorkspace;
  const currentView = activeView === 'board' || activeView === 'calendar' ? viewCopy[activeView] : null;

  async function startDm(member: WorkspaceMember) {
    if (!auth || !functions || !workspaceId || !userId || profilePending) return;
    const scope = `${workspaceId}:${userId}`;
    const actionId = ++profileActionRef.current;
    setProfilePending(true);
    setProfileError('');
    try {
      const existing = directMessages.find((room) => room.participantIds?.includes(member.uid));
      const roomId = existing?.id ?? (await callWorkspace<{ roomId: string }>(auth, functions, 'createDm', { workspaceId, memberId: member.uid })).roomId;
      if (scopeRef.current !== scope || profileActionRef.current !== actionId) return;
      setOpenedDm({ workspaceId, viewerId: userId, roomId });
      selectConversation({ kind: 'dm', id: roomId, name: member.displayName });
      closeProfile();
    } catch (cause) {
      if (scopeRef.current === scope && profileActionRef.current === actionId) {
        const code = cause && typeof cause === 'object' && 'code' in cause ? String(cause.code) : '';
        setProfileError(code === 'functions/permission-denied' ? '같은 워크스페이스 멤버끼리만 DM을 시작할 수 있습니다.'
          : code === 'functions/unavailable' || code === 'functions/not-found' ? 'DM 서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.'
            : 'DM을 열지 못했습니다. 잠시 후 다시 시도해 주세요.');
      }
    } finally {
      setProfilePending(false);
    }
  }

  async function openSource(task: TaskRecord<Timestamp>): Promise<void> {
    if (!db || !workspaceId || !userId || task.workspaceId !== workspaceId) throw new Error('원본 대화를 확인할 수 없습니다.');
    let snapshot;
    try {
      // A server read checks current channel/DM permissions even if an old copy is cached.
      snapshot = await getDocFromServer(doc(db, 'messages', task.sourceMessageId));
    } catch {
      throw new Error('원본 대화를 볼 권한이 없거나 연결할 수 없습니다.');
    }
    if (!snapshot.exists()) throw new Error('원본 메시지를 찾을 수 없습니다.');
    const message = snapshot.data();
    const roomId = message[task.sourceType === 'channel' ? 'channelId' : 'dmRoomId'];
    if (message.workspaceId !== workspaceId || message.sourceType !== task.sourceType || typeof roomId !== 'string'
      || typeof message.senderId !== 'string' || typeof message.content !== 'string'
      || typeof message.clientMessageId !== 'string' || !message.createdAt?.toDate) {
      throw new Error('원본 메시지를 확인할 수 없습니다.');
    }
    const available = task.sourceType === 'channel' ? channels : directMessages;
    const room = available.find((item) => item.id === roomId);
    if (!room) throw new Error('원본 대화가 목록에 없습니다. 잠시 후 다시 시도해 주세요.');
    const conversation: ConversationSelection = { kind: task.sourceType, id: roomId, name: room.name };
    useLiveChatStore.getState().mergeHistory(liveRoomKey(userId, { workspaceId, kind: task.sourceType, roomId }), [{
      workspaceId, kind: task.sourceType, roomId, messageId: snapshot.id,
      clientMessageId: message.clientMessageId, senderId: message.senderId,
      content: message.content, createdAt: message.createdAt.toDate().toISOString(),
    }]);
    openMessage(conversation, snapshot.id);
  }

  return (
    <WorkspaceLayout workspaceControls={workspaceControls} accountControls={accountControls} notificationControls={workspaceType === 'work' && liveChat && auth && db && functions && workspaceId && userId ? <NotificationCenter key={`${workspaceId}:${userId}`} auth={auth} db={db} functions={functions} workspaceId={workspaceId} viewerId={userId} /> : null} workspaceName={workspaceName} workspaceType={workspaceType} canManageWorkspace={canManageWorkspace} liveChat={liveChat} channels={channels} directMessages={directMessages} members={members} viewerId={userId} profileMember={profileMember} profilePending={profilePending} profileError={profileError} onOpenProfile={openProfile} onCloseProfile={closeProfile} onStartDm={(member) => void startDm(member)} conversationError={conversationError}>
      {showManagement ? workspaceManagement : activeView === 'home' ? workspaceType === 'work'
        ? <WorkHome name={workspaceName ?? 'Talkgo 데모 팀'} viewerId={userId ?? ''} taskState={taskState} onOpenBoard={() => setView('board')} onOpenCalendar={() => setView('calendar')} onOpenChat={() => setView('chat')} onOpenTask={openTask} />
        : <MeetupHome name={workspaceName ?? '모임 공간'} memberCount={members.length} channelCount={channels.length} onOpenProposals={() => setView('proposals')} onOpenChat={() => setView('chat')} />
        : activeView === 'proposals' && workspaceType === 'meetup' ? <MeetupProposalsPanel onOpenChat={() => setView('chat')} />
        : activeView === 'chat' || (activeView === 'workspace' && !canManageWorkspace) ? liveChat && auth && functions && workspaceId && userId
        ? <LiveChatPanel key={`${userId}:${workspaceId}:${activeConversation.kind}:${activeConversation.id}`} auth={auth} functions={functions} conversation={activeConversation} workspaceId={workspaceId} viewerId={userId} senderName={senderName ?? '나'} memberEmails={memberEmails} memberNames={memberNames} taskState={taskState} canCreateTasks={workspaceType === 'work'} focusedMessageId={focusedMessageId} onOpenTask={openTask} onOpenProfile={openProfile} />
        : <ChatPanel conversation={selectedConversation} workspaceId={workspaceId} viewerId={userId} senderName={senderName} /> : workspaceType === 'work' && activeView === 'board' && liveChat && auth && db && functions && workspaceId && userId
          ? <TaskBoardPanel key={workspaceId} auth={auth} db={db} functions={functions} viewerId={userId} memberNames={memberNames} taskState={taskState} focusedTaskId={focusedTaskId} onOpenSource={openSource} /> : workspaceType === 'work' && activeView === 'calendar' && liveChat && auth && db && functions && workspaceId && userId
            ? <Suspense fallback={<p className={styles.viewLoading} role="status">캘린더 불러오는 중…</p>}><TaskCalendarPanel key={workspaceId} auth={auth} db={db} functions={functions} workspaceId={workspaceId} viewerId={userId} taskState={taskState} /></Suspense> : currentView && <>
      <section className={styles.hero} aria-labelledby="hero-title">
        <p className={styles.eyebrow}>{currentView.eyebrow}</p>
        <h1 id="hero-title" aria-live="polite">{currentView.title}</h1>
        <p className={styles.description}>
          {currentView.description}
        </p>
        <div className={styles.flow} aria-label="대화에서 일정까지 이어지는 흐름">
          <span>대화</span>
          <span aria-hidden="true">→</span>
          <span>업무</span>
          <span aria-hidden="true">→</span>
          <span>일정</span>
        </div>
      </section>

      <section className={styles.preview} aria-labelledby="preview-title">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>ONE WORKSPACE</p>
            <h2 id="preview-title">대화부터 일정까지</h2>
          </div>
          <span className={styles.pendingLabel}>기능 준비 중</span>
        </div>
        <div className={styles.cardGrid}>
          {upcomingAreas.map((area, index) => (
            <article
              className={`${styles.card} ${activeView === area.id ? styles.activeCard : ''}`}
              key={area.id}
            >
              <span className={styles.cardNumber}>0{index + 1}</span>
              <h3>{area.title}</h3>
              <p>{area.description}</p>
            </article>
          ))}
        </div>
      </section>
      </>}
    </WorkspaceLayout>
  );
}
