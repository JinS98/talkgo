import assert from 'node:assert/strict';
import React from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/',
});

globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Node = dom.window.Node;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: dom.window.navigator,
});

const { cleanup, render, screen } = await import('@testing-library/react');
const userEvent = (await import('@testing-library/user-event')).default;
const server = await createServer({
  root: process.cwd(),
  server: { middlewareMode: true },
});

try {
  const { default: App } = await server.ssrLoadModule('/src/App.tsx');
  const { WorkHome } = await server.ssrLoadModule('/src/features/workspace/WorkspaceHome.tsx');
  const { useWorkspaceNavigationStore } = await server.ssrLoadModule('/src/store/useWorkspaceNavigationStore.ts');
  const user = userEvent.setup();
  const app = render(React.createElement(App));
  assert.equal(screen.queryByRole('button', { name: '워크스페이스 관리' }), null);

  const title = () => screen.getByRole('heading', { level: 1 }).textContent;
  assert.equal(title(), '# 전체');

  screen.getByRole('main').scrollTop = 120;
  await user.click(screen.getByRole('button', { name: '업무 보드' }));
  assert.equal(title(), '업무 보드');
  assert.equal(screen.getByRole('main').scrollTop, 0);
  assert.equal(useWorkspaceNavigationStore.getState().activeView, 'board');

  await user.click(screen.getByRole('button', { name: '팀원 A' }));
  assert.equal(title(), '팀원 A');
  assert.equal(screen.getByRole('button', { name: '채팅' }).getAttribute('aria-pressed'), 'true');
  assert.equal(useWorkspaceNavigationStore.getState().activeView, 'chat');
  assert.deepEqual(useWorkspaceNavigationStore.getState().selectedConversation, { kind: 'dm', id: 'member-a' });

  await user.click(screen.getByRole('button', { name: '캘린더' }));
  assert.equal(title(), '팀 캘린더');

  await user.click(screen.getByRole('button', { name: '채팅' }));
  assert.equal(title(), '팀원 A');

  const projectChannel = screen.getByRole('button', { name: '프로젝트' });
  projectChannel.focus();
  await user.keyboard('{Enter}');
  assert.equal(title(), '# 프로젝트');
  assert.equal(projectChannel.getAttribute('aria-pressed'), 'true');
  assert.deepEqual(useWorkspaceNavigationStore.getState().selectedConversation, { kind: 'channel', id: 'project' });

  app.unmount();
  render(React.createElement(App));
  assert.equal(title(), '# 프로젝트');

  cleanup();
  render(React.createElement(App, { workspaceName: '내 팀', canManageWorkspace: true, workspaceManagement: React.createElement('h1', null, '멤버와 초대 관리') }));
  await user.click(screen.getByRole('button', { name: '워크스페이스 관리' }));
  assert.equal(title(), '멤버와 초대 관리');
  assert.ok(screen.getAllByText('내 팀').length >= 1);
  cleanup();
  useWorkspaceNavigationStore.getState().setView('chat');
  render(React.createElement(App, { workspaceName: '참여 팀', canManageWorkspace: false }));
  assert.equal(screen.queryByRole('button', { name: '워크스페이스 관리' }), null);
  await user.click(screen.getByRole('button', { name: '홈' }));
  assert.equal(title(), '업무 홈');
  assert.ok(screen.getAllByText('참여 팀').length >= 1);
  assert.ok(screen.getByRole('button', { name: '업무 보드 열기' }));

  cleanup();
  useWorkspaceNavigationStore.getState().setView('home');
  render(React.createElement(App, { workspaceName: '주말 모임', workspaceType: 'meetup' }));
  assert.equal(title(), '모임 홈');
  assert.ok(screen.getAllByText('주말 모임').length >= 1);
  assert.equal(screen.queryByRole('button', { name: '업무 보드' }), null);
  assert.equal(screen.queryByRole('button', { name: '캘린더' }), null);
  await user.click(screen.getByRole('button', { name: '모임 제안', exact: true }));
  assert.equal(title(), '모임 제안 목록');
  assert.ok(screen.getByText('모임 제안 조회와 응답 기능을 준비 중입니다. 현재는 채팅에서 일정을 논의할 수 있습니다.'));

  cleanup();
  let openedTask = '';
  render(React.createElement(WorkHome, { name: '업무 팀', viewerId: 'me', taskState: { tasks: [{ id: 'task-1', title: '검증 업무', status: 'ACCEPTED', assigneeId: 'me', dueDate: { toDate: () => new Date('2026-12-02T09:00:00+09:00') } }], loading: false, error: '' }, onOpenBoard: () => {}, onOpenCalendar: () => {}, onOpenChat: () => {}, onOpenTask: (id) => { openedTask = id; } }));
  assert.equal(screen.getByText('내 담당 업무').parentElement.querySelector('strong').textContent, '1');
  await user.click(screen.getByRole('button', { name: /검증 업무/ }));
  assert.equal(openedTask, 'task-1');

  cleanup();
  let retried = false;
  render(React.createElement(WorkHome, { name: '업무 팀', viewerId: 'me', taskState: { tasks: [], loading: false, error: '목록 오류', retry: () => { retried = true; } }, onOpenBoard: () => {}, onOpenCalendar: () => {}, onOpenChat: () => {}, onOpenTask: () => {} }));
  await user.click(screen.getByRole('button', { name: '다시 시도' }));
  assert.equal(retried, true);

  console.log('Shared navigation, type-specific homes, task summary/retry and proposal views passed.');
} finally {
  cleanup();
  await server.close();
  dom.window.close();
}
