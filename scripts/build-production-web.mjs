import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';

const socketUrl = process.argv[2];
const expectedProjectId = process.argv[3]?.trim();
let parsed;
try {
  parsed = new URL(socketUrl);
} catch {
  throw new Error('Cloud Run 소켓 서버의 HTTPS 주소를 인자로 전달해 주세요.');
}
if (parsed.protocol !== 'https:' || parsed.origin !== socketUrl || parsed.username || parsed.password
  || parsed.hostname === 'localhost' || parsed.hostname.endsWith('.localhost')
  || parsed.hostname === '127.0.0.1' || parsed.hostname === '[::1]') {
  throw new Error('소켓 서버 주소는 경로나 인증 정보가 없는 HTTPS Origin이어야 합니다.');
}
if (process.argv.length !== 4 || !expectedProjectId || expectedProjectId.startsWith('demo-')) {
  throw new Error('배포 대상 Firebase 프로젝트 ID를 두 번째 인자로 전달해 주세요. demo- 프로젝트는 운영 빌드에 사용할 수 없습니다.');
}

const webRoot = fileURLToPath(new URL('../apps/web/', import.meta.url));
const webEnv = loadEnv('production', webRoot, 'VITE_');
if (webEnv.VITE_FIREBASE_PROJECT_ID?.trim() !== expectedProjectId) {
  throw new Error('웹 Firebase 프로젝트 ID가 배포 대상과 다릅니다. apps/web/.env.local과 명령 인자를 확인해 주세요.');
}
const missing = ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_AUTH_DOMAIN', 'VITE_FIREBASE_APP_ID']
  .filter((name) => !webEnv[name]?.trim());
if (missing.length) throw new Error(`운영 웹 설정이 누락되었습니다: ${missing.join(', ')}`);
if (webEnv.VITE_USE_FIREBASE_EMULATORS === 'true') {
  throw new Error('운영 웹 설정에서 Firebase 에뮬레이터를 사용하도록 지정할 수 없습니다.');
}

const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build:web'], {
  cwd: new URL('..', import.meta.url),
  env: { ...process.env, VITE_SOCKET_URL: socketUrl, VITE_USE_FIREBASE_EMULATORS: 'false' },
  shell: process.platform === 'win32',
  stdio: 'inherit',
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);
