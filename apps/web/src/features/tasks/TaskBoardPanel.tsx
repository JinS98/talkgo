import { useEffect, useRef, useState } from 'react';
import type { Auth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import type { Functions } from 'firebase/functions';
import { TaskCard } from './TaskCard';
import type { WorkspaceTask, WorkspaceTaskState } from './useWorkspaceTasks';
import styles from './TaskBoardPanel.module.scss';

type BoardTask = WorkspaceTask;
type Filter = 'all' | 'requested' | 'active' | 'finished';
type Scope = 'team' | 'assigned' | 'requested';
const filters: { id: Filter; label: string }[] = [
  { id: 'all', label: '전체' }, { id: 'requested', label: '요청 대기' },
  { id: 'active', label: '수락·진행' }, { id: 'finished', label: '완료·거절' },
];
const scopes: { id: Scope; label: string }[] = [
  { id: 'team', label: '팀 전체' }, { id: 'assigned', label: '내 담당 업무' }, { id: 'requested', label: '내가 요청한 업무' },
];
export function TaskBoardPanel({ auth, db, functions, viewerId, memberNames, taskState, focusedTaskId, onOpenSource }: {
  auth: Auth; db: Firestore; functions: Functions;
  viewerId: string; memberNames: Record<string, string>;
  taskState: WorkspaceTaskState;
  focusedTaskId: string | null; onOpenSource: (task: BoardTask) => Promise<void>;
}) {
  const boardRef = useRef<HTMLElement>(null);
  const scrolledTaskRef = useRef<string | null>(null);
  const [notice, setNotice] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [scope, setScope] = useState<Scope>('team');
  const [search, setSearch] = useState('');

  const { tasks, loading, error } = taskState;
  useEffect(() => {
    if (!focusedTaskId || loading || scrolledTaskRef.current === focusedTaskId) return;
    const card = Array.from(boardRef.current?.querySelectorAll<HTMLElement>('[data-task-id]') ?? [])
      .find((item) => item.dataset.taskId === focusedTaskId);
    if (!card) return;
    card.scrollIntoView({ block: 'center' });
    card.focus({ preventScroll: true });
    scrolledTaskRef.current = focusedTaskId;
  }, [focusedTaskId, loading, tasks]);
  const term = search.trim().toLocaleLowerCase('ko-KR');
  const scopedTasks = tasks.filter((task) => (scope === 'team' || scope === 'assigned' && task.assigneeId === viewerId || scope === 'requested' && task.requesterId === viewerId)
    && (!term || task.title.toLocaleLowerCase('ko-KR').includes(term)));
  const columns: { id: Filter; label: string; tasks: BoardTask[] }[] = [
    { id: 'requested', label: '요청 대기', tasks: scopedTasks.filter((task) => task.status === 'REQUESTED') },
    { id: 'active', label: '수락·진행', tasks: scopedTasks.filter((task) => !['REQUESTED', 'DECLINED', 'DONE'].includes(task.status)) },
    { id: 'finished', label: '완료·거절', tasks: scopedTasks.filter((task) => task.status === 'DONE' || task.status === 'DECLINED') },
  ];
  const visibleColumns = filter === 'all' ? columns : columns.filter((column) => column.id === filter);
  const displayedCount = visibleColumns.reduce((total, column) => total + column.tasks.length, 0);
  return <section className={styles.board} aria-labelledby="board-title" ref={boardRef}>
    <div className={styles.heading}><div><p className={styles.eyebrow}>TASK BOARD</p><h1 id="board-title">업무 보드</h1><p>대화에서 요청한 업무를 상태별로 확인하세요.</p></div><span className={styles.count}>{displayedCount === tasks.length ? `${tasks.length}개 업무` : `${displayedCount} / ${tasks.length}개 업무`}</span></div>
    <div className={styles.controls}><div className={styles.scopes} aria-label="업무 범위 필터">{scopes.map((item) => <button key={item.id} type="button" aria-pressed={scope === item.id} className={scope === item.id ? styles.selected : ''} onClick={() => setScope(item.id)}>{item.label}</button>)}</div><label className={styles.search}>업무 제목 검색<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="제목으로 찾기" /></label></div>
    <div className={styles.filters} aria-label="업무 상태 필터">{filters.map((item) => <button key={item.id} type="button" aria-pressed={filter === item.id} className={filter === item.id ? styles.selected : ''} onClick={() => setFilter(item.id)}>{item.label}</button>)}</div>
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    {!loading && focusedTaskId && !tasks.some((task) => task.id === focusedTaskId) && <p className={styles.error} role="alert">연결된 업무를 찾을 수 없습니다.</p>}
    {loading ? <p className={styles.empty}>업무를 불러오는 중…</p> : tasks.length === 0 ? <p className={styles.empty}>아직 업무 요청이 없습니다. 채팅 메시지에서 업무를 만들어 보세요.</p> : <>{displayedCount === 0 && <p className={styles.empty} role="status">조건에 맞는 업무가 없습니다. 범위나 검색어를 바꿔 보세요.</p>}<div className={`${styles.columns} ${filter !== 'all' ? styles.singleColumn : ''}`}>{visibleColumns.map((column) => <section className={styles.column} key={column.id} aria-label={column.label}><div className={styles.columnHeading}><h2>{column.label}</h2><span>{column.tasks.length}</span></div>{column.tasks.length ? column.tasks.map((task) => <TaskCard key={task.id} task={task} auth={auth} db={db} functions={functions} viewerId={viewerId} memberNames={memberNames} onNotice={setNotice} focused={task.id === focusedTaskId} onOpenSource={onOpenSource} />) : <p className={styles.columnEmpty}>이 상태의 업무가 없습니다.</p>}</section>)}</div></>}
  </section>;
}
