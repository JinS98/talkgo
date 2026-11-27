import assert from 'node:assert/strict';
import { createServer } from 'node:net';
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
const admin = initializeApp({ projectId }, 'workspace-types-browser-test');
const db = getFirestore(admin);
let vite;
let browser;

async function seedWorkspace(user, id, name, type) {
  const now = Timestamp.now();
  const batch = db.batch();
  batch.set(db.doc(`workspaces/${id}`), { name, ownerId: user.uid, ...(type === undefined ? {} : { type }), createdAt: now });
  batch.set(db.doc(`workspaces/${id}/members/${user.uid}`), { uid: user.uid, email: user.email, displayName: user.displayName, role: 'owner', joinedAt: now });
  batch.set(db.doc(`users/${user.uid}/workspaces/${id}`), { workspaceId: id, name, role: 'owner', joinedAt: now });
  await batch.commit();
}

async function selectWorkspace(page, name) {
  await page.getByRole('button', { name: '워크스페이스 선택' }).click();
  await page.getByRole('group', { name: '워크스페이스 목록' }).getByRole('button', { name: new RegExp(name) }).click();
}

try {
  const user = await getAuth(admin).createUser({ email: 'workspace-types@example.com', password: 'StrongPass123!', emailVerified: true, displayName: '유형 테스트' });
  const now = Timestamp.now();
  await db.doc(`users/${user.uid}`).set({ displayName: user.displayName, setupComplete: true, createdAt: now, updatedAt: now });

  const port = await new Promise((resolvePort) => { const server = createServer(); server.listen(0, '127.0.0.1', () => { const value = server.address().port; server.close(() => resolvePort(value)); }); });
  vite = await createViteServer({ root: process.cwd(), mode: 'emulator', server: { host: '127.0.0.1', port, strictPort: true, hmr: false } });
  await vite.listen();
  browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', args: ['--no-sandbox'] });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(`http://127.0.0.1:${port}/workspace`);
  await page.getByLabel('이메일', { exact: true }).fill(user.email);
  await page.getByLabel('비밀번호').fill('StrongPass123!');
  await page.getByRole('button', { name: '이메일로 로그인' }).click();

  await page.getByRole('heading', { name: '워크스페이스에 들어가기' }).waitFor();
  await page.getByLabel('워크스페이스 이름').fill('업무 팀');
  await page.getByLabel('공간 유형').selectOption('work');
  await page.getByRole('button', { name: '만들기', exact: true }).click();
  await page.waitForURL((url) => Boolean(url.searchParams.get('workspaceId')));
  await page.getByRole('button', { name: '업무 보드' }).waitFor();
  const workId = new URL(page.url()).searchParams.get('workspaceId');
  assert.ok(workId);
  assert.equal((await db.doc(`workspaces/${workId}`).get()).get('type'), 'work');

  await page.getByRole('button', { name: '워크스페이스 선택' }).click();
  await page.getByRole('group', { name: '워크스페이스 목록' }).getByRole('button', { name: /새 워크스페이스/ }).click();
  await page.getByRole('heading', { name: '새 워크스페이스' }).waitFor();
  await page.getByLabel('워크스페이스 이름').fill('주말 모임');
  await page.getByLabel('공간 유형').selectOption('meetup');
  await page.getByRole('button', { name: '새 공간 만들기' }).click();
  await page.waitForURL((url) => Boolean(url.searchParams.get('workspaceId')) && url.searchParams.get('workspaceId') !== workId);
  await page.getByRole('button', { name: '채팅' }).waitFor();
  const meetupId = new URL(page.url()).searchParams.get('workspaceId');
  assert.ok(meetupId && meetupId !== workId);
  assert.equal((await db.doc(`workspaces/${meetupId}`).get()).get('type'), 'meetup');
  assert.equal((await db.doc(`users/${user.uid}/workspaces/${meetupId}`).get()).get('type'), undefined);
  assert.equal(await page.getByRole('button', { name: '업무 보드' }).count(), 0);
  assert.equal(await page.getByRole('button', { name: '캘린더' }).count(), 0);

  await selectWorkspace(page, '업무 팀');
  await page.waitForURL((url) => url.searchParams.get('workspaceId') === workId);
  await page.getByRole('button', { name: '업무 보드' }).waitFor();
  assert.equal(new URL(page.url()).searchParams.get('workspaceId'), workId);

  await seedWorkspace(user, 'workspace-types-legacy', '기존 공간');
  await selectWorkspace(page, '기존 공간');
  await page.waitForURL((url) => url.searchParams.get('workspaceId') === 'workspace-types-legacy');
  await page.getByRole('button', { name: '업무 보드' }).waitFor();
  assert.equal(new URL(page.url()).searchParams.get('workspaceId'), 'workspace-types-legacy');
  await page.getByRole('button', { name: '워크스페이스 선택' }).click();
  await page.getByRole('group', { name: '워크스페이스 목록' }).getByRole('button', { name: /기존 공간/ }).getByText('업무 공간').waitFor();
  await page.getByRole('button', { name: '워크스페이스 선택' }).click();

  await seedWorkspace(user, 'workspace-types-invalid', '잘못된 공간', null);
  await selectWorkspace(page, '잘못된 공간');
  await page.getByRole('heading', { name: '워크스페이스를 열 수 없습니다' }).waitFor();
  await page.getByRole('button', { name: '다시 시도' }).click();
  await page.getByRole('heading', { name: '워크스페이스를 열 수 없습니다' }).waitFor();
  await selectWorkspace(page, '주말 모임');
  await page.getByRole('button', { name: '채팅' }).waitFor();
  assert.equal(await page.getByRole('button', { name: '업무 보드' }).count(), 0);
  assert.deepEqual(pageErrors, []);
  console.log('Workspace type browser verification passed: create, switch, legacy fallback, invalid type and retry.');
} finally {
  await browser?.close();
  await vite?.close();
  await deleteApp(admin);
}
