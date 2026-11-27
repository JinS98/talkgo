import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, Timestamp, where, type Firestore } from 'firebase/firestore';
import type { TaskRecord } from '@talkgo/contracts/task';

export type WorkspaceTask = TaskRecord<Timestamp> & { id: string };
export interface WorkspaceTaskState {
  tasks: WorkspaceTask[];
  loading: boolean;
  error: string;
  retry?: () => void;
}

const emptyTasks: WorkspaceTask[] = [];

export function useWorkspaceTasks(db?: Firestore, workspaceId?: string, viewerId?: string): WorkspaceTaskState {
  const [result, setResult] = useState<{ workspaceId: string; viewerId: string; tasks: WorkspaceTask[]; error: string } | null>(null);
  const [subscriptionAttempt, setSubscriptionAttempt] = useState(0);
  const retry = () => { setResult(null); setSubscriptionAttempt((attempt) => attempt + 1); };

  useEffect(() => {
    if (!db || !workspaceId || !viewerId) return;
    return onSnapshot(query(collection(db, 'tasks'), where('workspaceId', '==', workspaceId)), (snapshot) => {
      const tasks = snapshot.docs.map((item): WorkspaceTask => ({ ...item.data() as TaskRecord<Timestamp>, id: item.id }));
      tasks.sort((a, b) => a.dueDate.toMillis() - b.dueDate.toMillis() || a.id.localeCompare(b.id));
      setResult({ workspaceId, viewerId, tasks, error: '' });
    }, () => setResult({ workspaceId, viewerId, tasks: emptyTasks, error: '업무 목록을 불러오지 못했습니다. 연결 상태를 확인해 주세요.' }));
  }, [db, workspaceId, viewerId, subscriptionAttempt]);

  if (!db || !workspaceId || !viewerId) return { tasks: emptyTasks, loading: false, error: '', retry };
  if (!result || result.workspaceId !== workspaceId || result.viewerId !== viewerId) return { tasks: emptyTasks, loading: true, error: '', retry };
  return { tasks: result.tasks, loading: false, error: result.error, retry };
}
