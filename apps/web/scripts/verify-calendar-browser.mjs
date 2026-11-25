import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { chromium } from 'playwright-core';
import { createServer as createViteServer } from 'vite';

const projectId = 'demo-taskgo';
assert.equal(process.env.GCLOUD_PROJECT, projectId, 'Run with the demo-taskgo Firebase emulators.');
process.env.VITE_AUTH_EMULATOR_PORT = process.env.TALKGO_AUTH_EMULATOR_PORT ?? '9099';
process.env.VITE_FIRESTORE_EMULATOR_PORT = process.env.TALKGO_FIRESTORE_EMULATOR_PORT ?? '8080';
process.env.VITE_FUNCTIONS_EMULATOR_PORT = process.env.TALKGO_FUNCTIONS_EMULATOR_PORT ?? '5001';
const root = resolve(process.cwd(), '../..');
const admin = initializeApp({ projectId }, 'calendar-browser-test');
const db = getFirestore(admin);
let vite;
let browser;
try {
  const owner = await getAuth(admin).createUser({ email: 'calendar-owner@example.com', password: 'StrongPass123!', emailVerified: true, displayName: '캘린더 방장' });
  const member = await getAuth(admin).createUser({ email: 'calendar-member@example.com', password: 'StrongPass123!', emailVerified: true, displayName: '캘린더 멤버' });
  const workspaceId = 'calendar-team';
  const now = Timestamp.now();
  const due = Timestamp.fromMillis(now.toMillis() + 2 * 86_400_000);
  const batch = db.batch();
  batch.set(db.doc(`workspaces/${workspaceId}`), { name: 'Calendar Team', ownerId: owner.uid, createdAt: now });
  for (const [user, role] of [[owner, 'owner'], [member, 'member']]) {
    batch.set(db.doc(`users/${user.uid}`), { displayName: user.displayName, setupComplete: true, createdAt: now, updatedAt: now });
    batch.set(db.doc(`workspaces/${workspaceId}/members/${user.uid}`), { uid: user.uid, email: user.email, displayName: user.displayName, role, joinedAt: now });
    batch.set(db.doc(`users/${user.uid}/workspaces/${workspaceId}`), { workspaceId, name: 'Calendar Team', role, joinedAt: now });
  }
  for (let index = 0; index < 6; index += 1) batch.set(db.doc(`tasks/calendar-task-${index}`), {
    workspaceId, title: `캘린더 일정 ${index + 1}`, status: index === 0 ? 'REQUESTED' : 'ACCEPTED',
    requesterId: owner.uid, assigneeId: member.uid, reviewRequired: false, reviewCycle: 0, createdAt: now, dueDate: due,
  });
  await batch.commit();
  const port = await new Promise(resolvePort => { const server = createServer(); server.listen(0, '127.0.0.1', () => { const value = server.address().port; server.close(() => resolvePort(value)); }); });
  vite = await createViteServer({ root: process.cwd(), mode: 'emulator', server: { host: '127.0.0.1', port, strictPort: true, hmr: false } });
  await vite.listen();
  browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', args: ['--no-sandbox'] });
  const page = await (await browser.newContext()).newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${port}/workspace`);
  await page.getByLabel('이메일', { exact: true }).fill(owner.email);
  await page.getByLabel('비밀번호').fill('StrongPass123!');
  await page.getByRole('button', { name: '이메일로 로그인' }).click();
  await page.getByRole('button', { name: '캘린더' }).click();
  const pending = page.getByTitle(/^캘린더 일정 1 ·/).first();
  await pending.waitFor();
  assert.equal(await pending.evaluate(element => getComputedStyle(element).borderTopStyle), 'dashed');
  const pendingDisplay = await pending.evaluate(element => ({ color: getComputedStyle(element.querySelector('div') ?? element).color, text: element.textContent }));
  assert.match(pendingDisplay.text, /캘린더 일정 1/);
  assert.notEqual(pendingDisplay.color, 'rgb(255, 255, 255)', 'Pending task title must contrast with the white background.');
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now.toDate());
  const value = type => parts.find(item => item.type === type).value;
  const dateKey = `${value('year')}-${value('month')}-${value('day')}`;
  const cell = page.locator(`[data-date="${dateKey}"][role="cell"]`);
  await cell.locator('[role="button"][aria-haspopup="dialog"]').click();
  const popover = page.locator(`[role="dialog"][data-date="${dateKey}"]`);
  await popover.waitFor();
  for (let index = 0; index < 6; index += 1) await popover.getByText(`캘린더 일정 ${index + 1}`, { exact: true }).waitFor();
  if (process.env.TALKGO_CAPTURE_UI) await page.screenshot({ path: resolve(root, '.tmp-ui-calendar-more.png') });
  await popover.getByRole('button').click();
  await page.getByRole('button', { name: '회의 추가' }).click();
  const dialog = page.getByRole('dialog', { name: '회의 추가' });
  await dialog.getByLabel('회의 제목').fill('팀 주간 회의');
  const start = new Date(Date.now() + 4 * 86_400_000);
  const end = new Date(start.getTime() + 3_600_000);
  const local = date => new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  await dialog.getByLabel('시작 날짜·시간').fill(local(start));
  await dialog.getByLabel('종료 날짜·시간').fill(local(end));
  await dialog.getByRole('button', { name: '회의 등록' }).click();
  await page.getByTitle(/^회의 · 팀 주간 회의 ·/).waitFor({ timeout: 45000 });
  assert.equal((await db.collection('meetings').get()).size, 1);
  await page.getByRole('button', { name: '내 담당 업무' }).click();
  assert.equal(await page.getByTitle(/^회의 · 팀 주간 회의 ·/).count(), 0);
  await page.getByText('선택한 범위에 표시할 일정이 없습니다.').waitFor();
  await db.doc('tasks/calendar-review-task').set({
    workspaceId, title: '검수 대상 업무', status: 'REVIEW_PENDING', requesterId: owner.uid, assigneeId: member.uid,
    reviewRequired: true, reviewCycle: 1, createdAt: now,
    dueDate: Timestamp.fromMillis(now.toMillis() + 6 * 86_400_000),
    reviewSubmittedAt: Timestamp.fromMillis(now.toMillis() + 3 * 86_400_000),
    reviewDeadlineAt: Timestamp.fromMillis(now.toMillis() + 4 * 86_400_000),
  });
  await page.getByRole('button', { name: '내가 검수할 업무' }).click();
  await page.getByTitle(/^검수 · 검수 대상 업무 ·/).first().waitFor();
  assert.equal(await page.getByTitle(/^회의 · 팀 주간 회의 ·/).count(), 0);
  assert.equal(await page.getByTitle(/^캘린더 일정 1 ·/).count(), 0);
  assert.equal(await page.getByRole('button', { name: '내가 검수할 업무' }).getAttribute('aria-pressed'), 'true');
  await page.getByRole('button', { name: '팀 전체 일정' }).click();
  const memberPage = await (await browser.newContext()).newPage();
  memberPage.on('pageerror', error => errors.push(error.message));
  await memberPage.goto(`http://127.0.0.1:${port}/workspace`);
  await memberPage.getByLabel('이메일', { exact: true }).fill(member.email);
  await memberPage.getByLabel('비밀번호').fill('StrongPass123!');
  await memberPage.getByRole('button', { name: '이메일로 로그인' }).click();
  await memberPage.getByRole('button', { name: '캘린더' }).click();
  await memberPage.getByTitle(/^회의 · 팀 주간 회의 ·/).waitFor();
  await memberPage.getByRole('button', { name: '내 담당 업무' }).click();
  await memberPage.getByTitle(/^검수 대상 업무 ·/).first().waitFor();
  assert.equal(await memberPage.getByTitle(/^검수 · 검수 대상 업무 ·/).count(), 0);
  assert.equal(await memberPage.getByTitle(/^회의 · 팀 주간 회의 ·/).count(), 0);
  await memberPage.getByRole('button', { name: '내가 검수할 업무' }).click();
  await memberPage.getByText('선택한 범위에 표시할 일정이 없습니다.').waitFor();
  assert.equal(await memberPage.getByTitle(/^검수 · 검수 대상 업무 ·/).count(), 0);

  const dragStart = Timestamp.fromMillis(now.toMillis() + 7 * 86_400_000);
  const originalDue = Timestamp.fromMillis(now.toMillis() + 8 * 86_400_000);
  const dragTaskRef = db.doc('tasks/calendar-drag-task');
  await dragTaskRef.set({ workspaceId, title: '드래그 협의 업무', status: 'ACCEPTED', requesterId: owner.uid,
    assigneeId: member.uid, reviewRequired: false, reviewCycle: 0, proposedDueDate: null,
    createdAt: dragStart, dueDate: originalDue });
  await memberPage.getByRole('button', { name: '내 담당 업무' }).click();
  const draggable = memberPage.getByTitle(/^드래그 협의 업무 ·/).first();
  await draggable.waitFor();
  const targetDate = new Date(now.toMillis() + 10 * 86_400_000);
  const targetParts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(targetDate);
  const targetValue = type => targetParts.find(item => item.type === type).value;
  const targetKey = `${targetValue('year')}-${targetValue('month')}-${targetValue('day')}`;
  await draggable.dragTo(memberPage.locator(`[data-date="${targetKey}"][role="cell"]`));
  const dueDialog = memberPage.getByRole('dialog', { name: '마감 변경 제안' });
  await dueDialog.waitFor();
  if (process.env.TALKGO_CAPTURE_UI) await memberPage.screenshot({ path: resolve(root, '.tmp-ui-calendar-proposal.png') });
  assert.equal((await dragTaskRef.get()).get('dueDate').toMillis(), originalDue.toMillis(), 'Dragging must not directly change the stored due date.');
  const proposedLocal = await dueDialog.getByLabel('제안 마감 날짜·시간').inputValue();
  assert.notEqual(proposedLocal, local(originalDue.toDate()));
  await dueDialog.getByRole('button', { name: '제안 보내기' }).click();
  await dueDialog.waitFor({ state: 'hidden' });
  const pendingTask = await dragTaskRef.get();
  assert.equal(pendingTask.get('dueDate').toMillis(), originalDue.toMillis());
  assert.ok(pendingTask.get('proposedDueDate'));
  await page.getByRole('region', { name: '받은 마감 변경 제안' }).getByText('드래그 협의 업무').waitFor();
  await page.getByRole('region', { name: '받은 마감 변경 제안' }).getByRole('button', { name: '변경 승인' }).click();
  await page.getByRole('region', { name: '받은 마감 변경 제안' }).getByText('드래그 협의 업무').waitFor({ state: 'hidden' });
  const approvedTask = await dragTaskRef.get();
  assert.equal(approvedTask.get('dueDate').toMillis(), pendingTask.get('proposedDueDate').toMillis());
  assert.equal(approvedTask.get('proposedDueDate'), null);
  await dragTaskRef.update({ proposedDueDate: Timestamp.fromMillis(approvedTask.get('dueDate').toMillis() + 86_400_000) });
  await page.getByRole('region', { name: '받은 마감 변경 제안' }).getByText('드래그 협의 업무').waitFor();
  await page.getByRole('region', { name: '받은 마감 변경 제안' }).getByRole('button', { name: '변경 거절' }).click();
  await page.getByRole('region', { name: '받은 마감 변경 제안' }).getByText('드래그 협의 업무').waitFor({ state: 'hidden' });
  const rejectedTask = await dragTaskRef.get();
  assert.equal(rejectedTask.get('dueDate').toMillis(), approvedTask.get('dueDate').toMillis());
  assert.equal(rejectedTask.get('proposedDueDate'), null);
  if (process.env.TALKGO_CAPTURE_UI) await page.screenshot({ path: resolve(root, '.tmp-ui-calendar.png') });
  assert.deepEqual(errors, []);
  console.log('PASS: calendar filters, overflow, meeting visibility, drag proposal, approval, and rejection without premature due-date change.');
} finally {
  await browser?.close();
  await vite?.close();
  await deleteApp(admin);
}
