import type { Timestamp } from 'firebase/firestore';
import type { TaskStatus } from '@talkgo/contracts/task';
import type { WorkspaceTaskState } from '../tasks/useWorkspaceTasks';
import styles from './WorkspaceHome.module.scss';

const statusLabels: Record<TaskStatus, string> = {
  REQUESTED: '요청 대기', ACCEPTED: '수락', IN_PROGRESS: '진행 중', REVIEW_PENDING: '검수 대기',
  REWORK: '재작업', DECLINED: '거절', DONE: '완료',
};

function dueText(value: Timestamp): string {
  return new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric' }).format(value.toDate());
}

export function WorkHome({ name, viewerId, taskState, onOpenBoard, onOpenCalendar, onOpenChat, onOpenTask }: {
  name: string; viewerId: string; taskState: WorkspaceTaskState;
  onOpenBoard: () => void; onOpenCalendar: () => void; onOpenChat: () => void; onOpenTask: (taskId: string) => void;
}) {
  const { tasks, loading, error, retry } = taskState;
  const requested = tasks.filter((task) => task.status === 'REQUESTED').length;
  const active = tasks.filter((task) => !['REQUESTED', 'DONE', 'DECLINED'].includes(task.status)).length;
  const mine = tasks.filter((task) => task.assigneeId === viewerId && task.status !== 'DONE' && task.status !== 'DECLINED').length;
  const recent = tasks.filter((task) => task.status !== 'DONE' && task.status !== 'DECLINED').slice(0, 5);

  return <section className={styles.home} aria-labelledby="home-title">
    <div className={styles.heading}><p className={styles.eyebrow}>{name}</p><h1 id="home-title">업무 홈</h1><p>요청과 진행 중인 업무를 확인하세요.</p></div>
    <div className={styles.actions}><button type="button" className={styles.primaryAction} onClick={onOpenBoard}>업무 보드 열기</button><button type="button" onClick={onOpenCalendar}>캘린더 보기</button><button type="button" onClick={onOpenChat}>채팅으로 이동</button></div>
    {error ? <div className={styles.error} role="alert"><span>{error}</span>{retry && <button type="button" onClick={retry}>다시 시도</button>}</div> : null}
    <div className={styles.summary} aria-label="업무 현황">
      <div><span>요청 대기</span><strong>{loading ? '—' : requested}</strong></div>
      <div><span>수락·진행</span><strong>{loading ? '—' : active}</strong></div>
      <div><span>내 담당 업무</span><strong>{loading ? '—' : mine}</strong></div>
    </div>
    <section className={styles.panel} aria-labelledby="upcoming-title"><div className={styles.panelHeading}><h2 id="upcoming-title">진행할 업무</h2><button type="button" onClick={onOpenBoard}>전체 보기</button></div>
      {loading ? <p className={styles.empty} role="status">업무를 불러오는 중입니다…</p> : error ? <p className={styles.empty}>업무 목록을 확인할 수 없습니다.</p> : recent.length === 0 ? <p className={styles.empty}>진행할 업무가 없습니다. 채팅에서 새 업무를 요청할 수 있습니다.</p> :
        <ul className={styles.taskList}>{recent.map((task) => <li key={task.id}><button type="button" onClick={() => onOpenTask(task.id)}><span className={styles.taskTitle}>{task.title}</span><span className={styles.taskMeta}>{statusLabels[task.status]} · 마감 {dueText(task.dueDate)}</span></button></li>)}</ul>}
    </section>
  </section>;
}

export function MeetupHome({ name, memberCount, channelCount, onOpenProposals, onOpenChat }: {
  name: string; memberCount: number; channelCount: number; onOpenProposals: () => void; onOpenChat: () => void;
}) {
  return <section className={styles.home} aria-labelledby="home-title">
    <div className={styles.heading}><p className={styles.eyebrow}>{name}</p><h1 id="home-title">모임 홈</h1><p>멤버와 대화를 확인하고 모임 제안으로 이동하세요.</p></div>
    <div className={styles.actions}><button type="button" className={styles.primaryAction} onClick={onOpenProposals}>모임 제안 목록</button><button type="button" onClick={onOpenChat}>채팅으로 이동</button></div>
    <div className={styles.summary} aria-label="모임 공간 현황"><div><span>멤버</span><strong>{memberCount}</strong></div><div><span>채널</span><strong>{channelCount}</strong></div></div>
    <section className={styles.panel} aria-labelledby="proposal-preview-title"><div className={styles.panelHeading}><h2 id="proposal-preview-title">모임 제안</h2><button type="button" onClick={onOpenProposals}>목록 보기</button></div><p className={styles.empty}>모임 제안 기능을 준비 중입니다. 현재는 채팅과 멤버 대화를 이용할 수 있습니다.</p></section>
  </section>;
}

export function MeetupProposalsPanel({ onOpenChat }: { onOpenChat: () => void }) {
  return <section className={styles.home} aria-labelledby="proposals-title">
    <div className={styles.heading}><p className={styles.eyebrow}>MEETUP</p><h1 id="proposals-title">모임 제안 목록</h1><p>참여할 모임을 한곳에서 확인하는 화면입니다.</p></div>
    <section className={styles.panel} aria-labelledby="proposal-list-title"><div className={styles.panelHeading}><h2 id="proposal-list-title">제안</h2><span className={styles.pending}>준비 중</span></div><p className={styles.empty}>모임 제안 조회와 응답 기능을 준비 중입니다. 현재는 채팅에서 일정을 논의할 수 있습니다.</p><button type="button" className={styles.textAction} onClick={onOpenChat}>채팅으로 이동</button></section>
  </section>;
}
