import { spawnSync } from 'node:child_process';

const socketUrl = process.argv[2];
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

const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build:web'], {
  cwd: new URL('..', import.meta.url),
  env: { ...process.env, VITE_SOCKET_URL: socketUrl, VITE_USE_FIREBASE_EMULATORS: 'false' },
  shell: process.platform === 'win32',
  stdio: 'inherit',
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);
