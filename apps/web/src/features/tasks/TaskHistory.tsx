import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, Timestamp, where, type Firestore } from 'firebase/firestore';
import type { TaskEventAction, TaskEventRecord } from '@talkgo/contracts/task';
import type { WorkspaceTask } from './useWorkspaceTasks';
import styles from './TaskBoardPanel.module.scss';

type BoardTask = WorkspaceTask;
type BoardEvent = TaskEventRecord<Timestamp> & { id: string };
const eventLabels: Record<TaskEventAction, string> = {
  accept: '업무 요청 수락', decline: '업무 요청 거절', startProgress: '업무 진행 시작',
  proposeDueDate: '마감 변경 제안', approveDueDate: '마감 변경 승인', rejectDueDate: '마감 변경 거절',
  submitForReview: '검수 요청 제출',
  complete: '업무 완료', approveReview: '검수 승인', rejectReview: '검수 반려', resubmitForReview: '검수 재제출', autoCompleteReview: '검수 기한 경과 자동 완료',
};

export function formatDate(value: Timestamp | null): string {
  return value ? new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short' }).format(value.toDate()) : '';
}

export function TaskHistory({ db, task, memberNames }: { db: Firestore; task: BoardTask; memberNames: Record<string, string> }) {
  const [state, setState] = useState<{ events: BoardEvent[]; error: string } | null>(null);

  useEffect(() => onSnapshot(query(collection(db, 'taskEvents'), where('taskId', '==', task.id)), (snapshot) => {
    const events = snapshot.docs.map((item) => ({ ...item.data() as TaskEventRecord<Timestamp>, id: item.id }));
    events.sort((a, b) => a.createdAt.toMillis() - b.createdAt.toMillis() || a.id.localeCompare(b.id));
    setState({ events, error: '' });
  }, () => setState({ events: [], error: '업무 이력을 불러오지 못했습니다.' })), [db, task.id]);

  return <div className={styles.history}>
    <strong>업무 이력</strong>
    {state === null && <p role="status">이력을 불러오는 중…</p>}
    {state?.error && <p role="alert">{state.error}</p>}
    {state && !state.error && <ol>
      <li><span>업무 요청 생성</span><small>{memberNames[task.createdById ?? task.requesterId] ?? '멤버'} · {formatDate(task.createdAt)}</small></li>
      {state.events.map((event) => <li key={event.id}>
        <span>{event.action === 'accept' && event.metadata.automatic ? '본인 담당 업무 자동 수락' : eventLabels[event.action] ?? event.action}</span>
        <small>{event.action === 'autoCompleteReview' ? '시스템' : memberNames[event.actorId] ?? '멤버'} · {formatDate(event.createdAt)}</small>
        {event.action === 'proposeDueDate' && event.metadata.proposedDueDate && <small>제안 {formatDate(Timestamp.fromDate(new Date(event.metadata.proposedDueDate)))}</small>}
        {event.action === 'approveDueDate' && event.metadata.dueDate && <small>확정 {formatDate(Timestamp.fromDate(new Date(event.metadata.dueDate)))}</small>}
        {event.action === 'submitForReview' && event.metadata.reviewWorkingDays && <small>검수 기간 {event.metadata.reviewWorkingDays}근무일 · {event.metadata.reviewCycle}회차</small>}
        {event.action === 'resubmitForReview' && event.metadata.reviewWorkingDays && <small>검수 기간 {event.metadata.reviewWorkingDays}근무일 · {event.metadata.reviewCycle}회차</small>}
        {(event.action === 'submitForReview' || event.action === 'resubmitForReview') && event.metadata.reviewDeadlineAt && <small>검수 기한 {formatDate(Timestamp.fromDate(new Date(event.metadata.reviewDeadlineAt)))}</small>}
        {event.action === 'rejectReview' && event.metadata.rejectionReason && <small>사유: {event.metadata.rejectionReason}</small>}
        {event.action === 'autoCompleteReview' && event.metadata.reviewCycle && <small>{event.metadata.reviewCycle}회차 검수 기한 경과</small>}
      </li>)}
    </ol>}
  </div>;
}
