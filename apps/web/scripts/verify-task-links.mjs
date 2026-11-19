import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { chromium } from 'playwright-core';
import { createServer as createViteServer } from 'vite';

const projectId = 'demo-taskgo';
assert.equal(process.env.GCLOUD_PROJECT, projectId, 'Run with the demo-taskgo Firebase emulators.');
process.env.VITE_AUTH_EMULATOR_PORT = process.env.TASKGO_AUTH_EMULATOR_PORT ?? '9099';
process.env.VITE_FIRESTORE_EMULATOR_PORT = process.env.TASKGO_FIRESTORE_EMULATOR_PORT ?? '8080';
process.env.VITE_FUNCTIONS_EMULATOR_PORT = process.env.TASKGO_FUNCTIONS_EMULATOR_PORT ?? '5001';
const admin = initializeApp({ projectId }, 'task-links-browser-test');
const db = getFirestore(admin);
let vite;
let browser;

function task(workspaceId, sourceMessageId, sourceType, title, requesterId, assigneeId, now) {
  return {
    workspaceId, sourceMessageId, sourceType, title, requesterId, assigneeId, createdById: requesterId,
    status: 'ACCEPTED', description: null, dueDate: Timestamp.fromMillis(now.toMillis() + 86400000),
    proposedDueDate: null, estimatedMinutes: null, reviewRequired: false, reviewWorkingDays: null,
    reviewCycle: 0, reviewDeadlineAt: null, completionReason: null, createdAt: now, updatedAt: now,
  };
}

async function login(page, origin, user) {
  await page.goto(`${origin}/workspace`);
  await page.getByLabel('이메일', { exact: true }).fill(user.email);
  await page.getByLabel('비밀번호').fill('StrongPass123!');
  await page.getByRole('button', { name: '이메일로 로그인' }).click();
  await page.getByRole('button', { name: '업무 보드' }).waitFor();
}

try {
  const auth = getAuth(admin);
  const owner = await auth.createUser({ email: 'links-owner@example.com', password: 'StrongPass123!', emailVerified: true, displayName: '링크 방장' });
  const member = await auth.createUser({ email: 'links-member@example.com', password: 'StrongPass123!', emailVerified: true, displayName: '링크 팀원' });
  const outsider = await auth.createUser({ email: 'links-outsider@example.com', password: 'StrongPass123!', emailVerified: true, displayName: '다른 팀원' });
  const workspaceId = 'task-links-team';
  const now = Timestamp.now();
  const batch = db.batch();
  batch.set(db.doc(`workspaces/${workspaceId}`), { name: 'Links Team', ownerId: owner.uid, createdAt: now });
  for (const [user, role] of [[owner, 'owner'], [member, 'member'], [outsider, 'member']]) {
    batch.set(db.doc(`users/${user.uid}`), { displayName: user.displayName, setupComplete: true, createdAt: now, updatedAt: now });
    batch.set(db.doc(`workspaces/${workspaceId}/members/${user.uid}`), { uid: user.uid, email: user.email, displayName: user.displayName, role, joinedAt: now });
    batch.set(db.doc(`users/${user.uid}/workspaces/${workspaceId}`), { workspaceId, name: 'Links Team', role, joinedAt: now });
  }
  batch.set(db.doc(`channels/general_${workspaceId}`), { workspaceId, name: '전체', createdAt: now });
  batch.set(db.doc('dmRooms/links-dm'), { workspaceId, participantIds: [owner.uid, member.uid], createdAt: now });
  const baseTime = now.toMillis() - 3600000;
  for (let index = 0; index < 35; index += 1) {
    batch.set(db.doc(`messages/links-channel-${index}`), {
      workspaceId, sourceType: 'channel', channelId: `general_${workspaceId}`,
      senderId: owner.uid, clientMessageId: `links-client-${index}`,
      content: index === 0 ? '오래된 채널 원본' : index === 34 ? '최근 채널 원본' : `채널 메시지 ${index}`,
      createdAt: Timestamp.fromMillis(baseTime + index * 1000),
    });
  }
  batch.set(db.doc('messages/links-dm'), { workspaceId, sourceType: 'dm', dmRoomId: 'links-dm', senderId: owner.uid, clientMessageId: 'links-dm-client', content: '비공개 원본', createdAt: now });
  batch.set(db.doc('tasks/links-recent'), task(workspaceId, 'links-channel-34', 'channel', '최근 채널 업무', owner.uid, member.uid, now));
  batch.set(db.doc('tasks/links-old'), task(workspaceId, 'links-channel-0', 'channel', '오래된 채널 업무', owner.uid, member.uid, now));
  batch.set(db.doc('tasks/links-private'), task(workspaceId, 'links-dm', 'dm', 'DM 후속 업무', owner.uid, member.uid, now));
  await batch.commit();

  const port = await new Promise((resolvePort) => { const server = createServer(); server.listen(0, '127.0.0.1', () => { const value = server.address().port; server.close(() => resolvePort(value)); }); });
  vite = await createViteServer({ root: process.cwd(), mode: 'emulator', server: { host: '127.0.0.1', port, strictPort: true, hmr: false } });
  await vite.listen();
  browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', args: ['--no-sandbox'] });
  const origin = `http://127.0.0.1:${port}`;
  const ownerPage = await (await browser.newContext()).newPage();
  const errors = [];
  ownerPage.on('pageerror', (error) => errors.push(error.message));
  await login(ownerPage, origin, owner);
  const recentSource = ownerPage.getByRole('listitem').filter({ hasText: '최근 채널 원본' });
  await recentSource.hover();
  await recentSource.getByRole('button', { name: '업무 보기 · 최근 채널 업무' }).click();
  const recentCard = ownerPage.getByRole('article').filter({ hasText: '최근 채널 업무' });
  await recentCard.waitFor();
  assert.match(await recentCard.getAttribute('class'), /focusedCard/);
  await ownerPage.waitForFunction(() => document.activeElement?.getAttribute('data-task-id') === 'links-recent');
  await ownerPage.getByRole('article').filter({ hasText: '오래된 채널 업무' }).getByRole('button', { name: '원본 대화 보기' }).click();
  const oldSource = ownerPage.getByRole('listitem').filter({ hasText: '오래된 채널 원본' });
  await oldSource.waitFor();
  assert.match(await oldSource.getAttribute('class'), /focusedMessage/);
  await ownerPage.waitForFunction(() => document.activeElement?.getAttribute('data-message-id') === 'links-channel-0');
  await ownerPage.locator('section[aria-labelledby="dm-heading"]').getByRole('button', { name: '링크 팀원' }).click();
  const dmSource = ownerPage.getByRole('listitem').filter({ hasText: '비공개 원본' });
  await dmSource.hover();
  await dmSource.getByRole('button', { name: '업무 보기 · DM 후속 업무' }).click();
  await ownerPage.getByRole('article').filter({ hasText: 'DM 후속 업무' }).getByRole('button', { name: '원본 대화 보기' }).click();
  await dmSource.waitFor();
  assert.match(await dmSource.getAttribute('class'), /focusedMessage/);

  for (const width of [390, 320]) {
    await ownerPage.setViewportSize({ width, height: 844 });
    for (const view of ['채팅', '업무 보드', '캘린더']) {
      await ownerPage.getByRole('button', { name: view, exact: true }).click();
      if (view === '캘린더') {
        await ownerPage.locator('[data-date][role="cell"]').first().waitFor();
      }
      const size = await ownerPage.evaluate(() => ({ viewport: window.innerWidth, page: document.documentElement.scrollWidth }));
      assert.ok(size.page <= size.viewport, `${view} has page overflow at ${width}px: ${JSON.stringify(size)}`);
    }
  }
  await ownerPage.getByRole('button', { name: '채팅', exact: true }).click();
  await dmSource.hover();
  await dmSource.getByRole('button', { name: '업무 요청' }).click();
  const taskDialog = ownerPage.getByRole('dialog', { name: '업무 요청 만들기' });
  await taskDialog.waitFor();
  const bounds = await taskDialog.boundingBox();
  assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 320, `Task dialog must fit a 320px viewport: ${JSON.stringify(bounds)}`);
  await ownerPage.keyboard.press('Escape');
  await taskDialog.waitFor({ state: 'hidden' });
  await ownerPage.setViewportSize({ width: 1280, height: 720 });

  const outsiderPage = await (await browser.newContext()).newPage();
  outsiderPage.on('pageerror', (error) => errors.push(error.message));
  await login(outsiderPage, origin, outsider);
  await outsiderPage.getByRole('button', { name: '업무 보드' }).click();
  const privateCard = outsiderPage.getByRole('article').filter({ hasText: 'DM 후속 업무' });
  await privateCard.getByRole('button', { name: '원본 대화 보기' }).click();
  await privateCard.getByRole('alert').getByText('원본 대화를 볼 권한이 없거나 연결할 수 없습니다.').waitFor();
  assert.equal(await outsiderPage.getByText('비공개 원본').count(), 0);
  assert.deepEqual(errors, []);
  console.log('Task/message links, keyboard focus, mobile layouts, and DM permission checks passed.');
} finally {
  await browser?.close();
  await vite?.close();
  await deleteApp(admin);
}
