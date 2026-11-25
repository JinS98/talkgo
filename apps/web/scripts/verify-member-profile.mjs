import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { chromium } from 'playwright-core';
import { createServer as createViteServer } from 'vite';

const projectId = 'demo-taskgo';
assert.equal(process.env.GCLOUD_PROJECT, projectId, 'Run with the demo-taskgo Firebase emulators.');
const authPort = Number(process.env.TALKGO_AUTH_EMULATOR_PORT ?? 9099);
const firestorePort = Number(process.env.TALKGO_FIRESTORE_EMULATOR_PORT ?? 8080);
const functionsPort = Number(process.env.TALKGO_FUNCTIONS_EMULATOR_PORT ?? 5001);
process.env.VITE_AUTH_EMULATOR_PORT = String(authPort);
process.env.VITE_FIRESTORE_EMULATOR_PORT = String(firestorePort);
process.env.VITE_FUNCTIONS_EMULATOR_PORT = String(functionsPort);
const root = resolve(process.cwd(), '../..');
const admin = initializeApp({ projectId }, 'member-profile-browser-test');
const db = getFirestore(admin);
let vite;
let browser;
let socketProcess;
let socketOutput = '';
const errors = [];

async function availablePort() {
  const server = createServer();
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const port = server.address().port;
  await new Promise((done) => server.close(done));
  return port;
}

async function login(page, origin, email) {
  page.on('pageerror', (error) => errors.push(`${email}: ${error.message}`));
  await page.goto(`${origin}/workspace`);
  await page.getByLabel('이메일', { exact: true }).fill(email);
  await page.getByLabel('비밀번호').fill('StrongPass123!');
  await page.getByRole('button', { name: '이메일로 로그인' }).click();
  await page.getByText('실시간 연결됨').waitFor({ timeout: 20000 });
}

async function send(page, content) {
  await page.getByRole('textbox', { name: '메시지 입력' }).fill(content);
  await page.getByRole('button', { name: '전송', exact: true }).click();
}

try {
  const owner = await getAuth(admin).createUser({ email: 'profile-owner@example.com', password: 'StrongPass123!', emailVerified: true, displayName: '프로필 방장' });
  const member = await getAuth(admin).createUser({ email: 'profile-member@example.com', password: 'StrongPass123!', emailVerified: true, displayName: '프로필 팀원' });
  const workspaceId = 'profile-team';
  const batch = db.batch();
  batch.set(db.doc(`workspaces/${workspaceId}`), { name: '프로필 팀', ownerId: owner.uid, createdAt: Timestamp.now() });
  for (const [user, role] of [[owner, 'owner'], [member, 'member']]) {
    batch.set(db.doc(`users/${user.uid}`), { displayName: user.displayName, setupComplete: true, title: user.uid === member.uid ? '디자인' : '', bio: user.uid === member.uid ? '화면을 설계합니다.' : '', createdAt: Timestamp.now(), updatedAt: Timestamp.now() });
    batch.set(db.doc(`workspaces/${workspaceId}/members/${user.uid}`), { uid: user.uid, email: user.email, displayName: user.displayName, title: user.uid === member.uid ? '디자인' : '', bio: user.uid === member.uid ? '화면을 설계합니다.' : '', role, joinedAt: Timestamp.now() });
    batch.set(db.doc(`users/${user.uid}/workspaces/${workspaceId}`), { workspaceId, name: '프로필 팀', role, joinedAt: Timestamp.now() });
  }
  await batch.commit();

  const [socketPort, vitePort] = await Promise.all([availablePort(), availablePort()]);
  const origin = `http://127.0.0.1:${vitePort}`;
  process.env.VITE_SOCKET_URL = `http://127.0.0.1:${socketPort}`;
  socketProcess = spawn(process.execPath, ['apps/socket-server/dist/index.js'], {
    cwd: root,
    env: { ...process.env, PORT: String(socketPort), SOCKET_HOST: '127.0.0.1', SOCKET_ALLOWED_ORIGINS: origin, FIREBASE_PROJECT_ID: projectId },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  socketProcess.stdout.on('data', (chunk) => { socketOutput += chunk; });
  socketProcess.stderr.on('data', (chunk) => { socketOutput += chunk; });
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try { if ((await fetch(`http://127.0.0.1:${socketPort}/healthz`)).ok) break; } catch { /* Server starting. */ }
    if (socketProcess.exitCode !== null) throw new Error(`Socket server exited: ${socketOutput}`);
    if (attempt === 79) throw new Error(`Socket server did not start: ${socketOutput}`);
    await delay(150);
  }

  vite = await createViteServer({ root: process.cwd(), mode: 'emulator', server: { host: '127.0.0.1', port: vitePort, strictPort: true, hmr: false } });
  await vite.listen();
  browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', args: ['--no-sandbox'] });
  const ownerPage = await (await browser.newContext()).newPage();
  const memberPage = await (await browser.newContext()).newPage();
  await login(ownerPage, origin, owner.email);
  await login(memberPage, origin, member.email);

  await ownerPage.locator('section[aria-labelledby="members-heading"]').getByRole('button', { name: member.displayName }).click();
  const memberProfile = ownerPage.getByRole('complementary', { name: '프로필' });
  await memberProfile.getByText('화면을 설계합니다.').waitFor();
  await memberProfile.getByText(member.email).waitFor();
  if (process.env.TALKGO_CAPTURE_PROFILE) await ownerPage.screenshot({ path: resolve(root, '.tmp-profile-panel.png') });
  await ownerPage.setViewportSize({ width: 390, height: 844 });
  await memberProfile.evaluate(async (element) => { await Promise.all(element.getAnimations().map((animation) => animation.finished)); });
  const panelBounds = await memberProfile.boundingBox();
  if (process.env.TALKGO_CAPTURE_PROFILE) await ownerPage.screenshot({ path: resolve(root, '.tmp-profile-mobile.png') });
  assert.ok(panelBounds && panelBounds.x >= 0 && panelBounds.x + panelBounds.width <= 391, `The profile panel must fit a 390px viewport: ${JSON.stringify(panelBounds)}`);
  await ownerPage.setViewportSize({ width: 1280, height: 720 });
  await memberProfile.getByRole('button', { name: '메시지 보내기' }).click();
  await memberProfile.waitFor({ state: 'hidden' });
  await ownerPage.getByText('실시간 연결됨').waitFor();
  await send(ownerPage, 'first private ping');
  await ownerPage.getByText('first private ping').waitFor();
  const roomSnapshot = await db.collection('dmRooms').where('workspaceId', '==', workspaceId).get();
  assert.equal(roomSnapshot.size, 1);
  assert.deepEqual(roomSnapshot.docs[0].get('participantIds').sort(), [owner.uid, member.uid].sort());
  await memberPage.locator('section[aria-labelledby="dm-heading"]').getByRole('button', { name: owner.displayName }).click();
  await memberPage.getByText('first private ping').waitFor();

  await ownerPage.getByRole('button', { name: '계정' }).click();
  const account = ownerPage.getByRole('region', { name: '계정 설정' });
  await account.getByLabel('직책').fill('기획');
  await account.getByLabel('소개').fill('업무 흐름을 정리합니다.');
  await account.getByRole('button', { name: '프로필 저장' }).click();
  await account.getByText('프로필 정보를 저장했습니다.').waitFor();
  await ownerPage.getByRole('button', { name: '계정' }).click();
  await memberPage.locator('section[aria-labelledby="members-heading"]').getByRole('button', { name: owner.displayName }).click();
  const ownerProfile = memberPage.getByRole('complementary', { name: '프로필' });
  await ownerProfile.getByText('업무 흐름을 정리합니다.').waitFor();
  await ownerProfile.getByRole('button', { name: '프로필 닫기' }).click();

  await ownerPage.locator('section[aria-labelledby="channels-heading"]').getByRole('button', { name: '전체' }).click();
  await memberPage.locator('section[aria-labelledby="channels-heading"]').getByRole('button', { name: '전체' }).click();
  await send(ownerPage, 'channel profile entry');
  const channelMessage = memberPage.getByRole('listitem').filter({ hasText: 'channel profile entry' });
  await channelMessage.getByRole('button', { name: `${owner.displayName} 프로필 보기` }).click();
  await memberPage.getByRole('complementary', { name: '프로필' }).getByRole('button', { name: '메시지 보내기' }).click();
  await memberPage.getByText('first private ping').waitFor();
  assert.equal((await db.collection('dmRooms').get()).size, 1, 'Opening an existing DM must reuse its room.');
  assert.deepEqual(errors, []);
  console.log('PASS: member list, profile details, mobile slide panel, message author, profile editing, and new/existing DM.');
} finally {
  await browser?.close();
  await vite?.close();
  if (socketProcess && socketProcess.exitCode === null) socketProcess.kill();
  await deleteApp(admin);
}
