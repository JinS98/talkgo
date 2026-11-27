import { useEffect, useRef, type ReactNode } from 'react';
import {
  demoChannels,
  demoDirectMessages,
  getConversationName,
  type DemoChannel,
  type DemoDirectMessage,
} from '../../features/chat/demoConversations';
import { useWorkspaceNavigationStore } from '../../store/useWorkspaceNavigationStore';
import type { WorkspaceMember } from '../../features/chat/useWorkspaceConversations';
import type { AppView } from '../../types/domain';
import type { WorkspaceType } from '../../features/workspace/workspaceType';
import { MemberProfilePanel } from './MemberProfilePanel';
import styles from './WorkspaceLayout.module.scss';

interface WorkspaceLayoutProps {
  children: ReactNode;
  workspaceControls?: ReactNode;
  accountControls?: ReactNode;
  notificationControls?: ReactNode;
  workspaceName?: string;
  workspaceType?: WorkspaceType;
  canManageWorkspace?: boolean;
  liveChat?: boolean;
  channels?: DemoChannel[];
  directMessages?: DemoDirectMessage[];
  members?: WorkspaceMember[];
  viewerId?: string;
  profileMember?: WorkspaceMember | null;
  profilePending?: boolean;
  profileError?: string;
  onOpenProfile?: (memberId: string) => void;
  onCloseProfile?: () => void;
  onStartDm?: (member: WorkspaceMember) => void;
  conversationError?: string;
}

const primaryViews: { id: AppView; label: string }[] = [
  { id: 'chat', label: '채팅' },
  { id: 'board', label: '업무 보드' },
  { id: 'calendar', label: '캘린더' },
];

function NavigationIcon({ view }: { view: AppView }) {
  const paths: Record<AppView, ReactNode> = {
    chat: <><path d="M4 5.5h16v11H9l-5 3v-14Z" /><path d="M8 9.5h8M8 12.5h5" /></>,
    board: <><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></>,
    calendar: <><rect x="4" y="6" width="16" height="14" rx="2" /><path d="M8 4v4m8-4v4M4 10h16" /><path d="M9 14h2m3 0h2" /></>,
    workspace: <><circle cx="12" cy="12" r="3" /><path d="M12 2.5v2m0 15v2M2.5 12h2m15 0h2M5.3 5.3l1.4 1.4m10.6 10.6 1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4" /></>,
  };
  return <span className={styles.navIcon}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[view]}</svg></span>;
}

export function WorkspaceLayout({ children, workspaceControls, accountControls, notificationControls, workspaceName, workspaceType = 'work', canManageWorkspace = false, liveChat = false, channels, directMessages, members = [], viewerId = '', profileMember, profilePending = false, profileError = '', onOpenProfile, onCloseProfile, onStartDm, conversationError }: WorkspaceLayoutProps) {
  const mainRef = useRef<HTMLElement>(null);
  const activeView = useWorkspaceNavigationStore((state) => state.activeView);
  const selectedConversation = useWorkspaceNavigationStore((state) => state.selectedConversation);
  const setView = useWorkspaceNavigationStore((state) => state.setView);
  const selectConversation = useWorkspaceNavigationStore((state) => state.selectConversation);
  const currentTitle = activeView === 'workspace' ? '워크스페이스 관리'
    : activeView === 'board' ? '업무 보드'
      : activeView === 'calendar' ? '캘린더'
        : `${selectedConversation.kind === 'channel' ? '# ' : ''}${getConversationName(selectedConversation)}`;
  const visibleChannels = liveChat ? channels ?? [] : demoChannels;
  const visibleDirectMessages = liveChat ? directMessages ?? [] : demoDirectMessages;

  useEffect(() => { if (mainRef.current) mainRef.current.scrollTop = 0; }, [activeView, workspaceName]);

  return (
    <div className={`${styles.shell} ${profileMember ? styles.profileOpen : ''}`}>
      <a className={styles.skipLink} href="#main-content">
        본문으로 이동
      </a>

      <aside className={styles.sidebar} aria-label="워크스페이스 영역">
        <nav className={styles.primaryNav} aria-label="화면 전환">
          <span className={styles.railBrand}><img src="/favicon.svg" alt="Talkgo" /></span>
          <ul className={styles.primaryList}>
            {primaryViews.filter(({ id }) => workspaceType === 'work' || id === 'chat').map(({ id, label }) => <li key={id}>
              <button className={`${styles.primaryButton} ${activeView === id ? styles.active : ''}`} type="button" aria-pressed={activeView === id} onClick={() => setView(id)}>
                <NavigationIcon view={id} /><span>{label}</span>
              </button>
            </li>)}
          </ul>
          {canManageWorkspace && <button className={`${styles.manageLink} ${activeView === 'workspace' ? styles.active : ''}`} type="button" aria-pressed={activeView === 'workspace'} onClick={() => setView('workspace')}><NavigationIcon view="workspace" /><span>워크스페이스 관리</span></button>}
        </nav>

        <div className={styles.sidebarBody}>
          <div className={styles.brandRow}>
            <span className={styles.brandName}>TALKGO</span>
            <strong className={styles.sidebarTitle}>대화</strong>
          </div>

          <div className={styles.workspaceSection}>
            {workspaceControls ?? <div className={styles.workspaceCard}>
              <span className={styles.workspaceIcon} aria-hidden="true">T</span>
              <div>
                <strong>{workspaceName ?? 'Talkgo 데모 팀'}</strong>
                <span>{canManageWorkspace ? '워크스페이스 장' : workspaceName ? '멤버' : '샘플 데이터'}</span>
              </div>
            </div>}
          </div>

          <div className={styles.conversationGroups}>
            <section aria-labelledby="channels-heading">
              <h2 id="channels-heading" className={styles.sectionLabel}>채널</h2>
              <ul className={styles.conversationList}>
                {visibleChannels.map(({ id, name }) => (
                  <li key={id}>
                    <button
                      className={`${styles.conversationButton} ${activeView === 'chat' && selectedConversation.kind === 'channel' && selectedConversation.id === id ? styles.active : ''}`}
                      type="button"
                      aria-pressed={activeView === 'chat' && selectedConversation.kind === 'channel' && selectedConversation.id === id}
                      onClick={() => selectConversation(liveChat ? { kind: 'channel', id, name } : { kind: 'channel', id })}
                    >
                      <span className={styles.channelIcon} aria-hidden="true">#</span>
                      <span>{name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>

            <section aria-labelledby="dm-heading">
              <h2 id="dm-heading" className={styles.sectionLabel}>DM</h2>
              <ul className={styles.conversationList}>
                {visibleDirectMessages.map(({ id, name, initials }) => (
                  <li key={id}>
                    <button
                      className={`${styles.conversationButton} ${activeView === 'chat' && selectedConversation.kind === 'dm' && selectedConversation.id === id ? styles.active : ''}`}
                      type="button"
                      aria-pressed={activeView === 'chat' && selectedConversation.kind === 'dm' && selectedConversation.id === id}
                      onClick={() => selectConversation(liveChat ? { kind: 'dm', id, name } : { kind: 'dm', id })}
                    >
                      <span className={styles.avatar} aria-hidden="true">{initials}</span>
                      <span>{name}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {liveChat && visibleDirectMessages.length === 0 && <p className={styles.emptyNote}>아직 DM이 없습니다.</p>}
            </section>
            {liveChat && <section aria-labelledby="members-heading">
              <h2 id="members-heading" className={styles.sectionLabel}>멤버 <span>{members.length}</span></h2>
              <ul className={styles.conversationList}>
                {members.map((member) => <li key={member.uid}>
                  <button className={styles.conversationButton} type="button" onClick={() => onOpenProfile?.(member.uid)}>
                    <span className={styles.avatar} aria-hidden="true">{member.displayName.charAt(0).toUpperCase()}</span>
                    <span>{member.displayName}{member.uid === viewerId && ' (나)'}</span>
                  </button>
                </li>)}
              </ul>
            </section>}
            {conversationError && <p role="alert" className={styles.sectionLabel}>{conversationError}</p>}
          </div>
        </div>
      </aside>

      <div className={styles.mainColumn}>
        <header className={styles.topbar}>
          <div className={styles.topbarContext}><span className={styles.topbarTitle}>{currentTitle}</span>{!liveChat && activeView !== 'workspace' && <span className={styles.previewBadge}>샘플 화면</span>}</div>
          <div className={styles.topbarActions}>
            {notificationControls}
            {accountControls}
          </div>
        </header>
        <main id="main-content" className={`${styles.main} ${activeView === 'chat' ? styles.chatMain : ''}`} ref={mainRef}>
          {children}
        </main>
      </div>
      {profileMember && onCloseProfile && onStartDm && <>
        <button className={styles.profileBackdrop} type="button" aria-label="프로필 닫기" onClick={onCloseProfile} />
        <div className={styles.profileSlot}><MemberProfilePanel member={profileMember} viewerId={viewerId} pending={profilePending} error={profileError} onClose={onCloseProfile} onMessage={onStartDm} /></div>
      </>}
    </div>
  );
}
