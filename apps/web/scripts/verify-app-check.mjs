import assert from 'node:assert/strict';
import { deleteApp, initializeApp } from 'firebase/app';
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, getIdToken, signOut } from 'firebase/auth';

assert.equal(process.env.GCLOUD_PROJECT, 'demo-taskgo', 'Run against the demo-taskgo Functions emulator.');
assert.equal(process.env.TALKGO_ENFORCE_APP_CHECK, 'true', 'Enable App Check enforcement for this probe.');

const app = initializeApp({
  apiKey: 'demo-taskgo-key',
  authDomain: 'demo-taskgo.firebaseapp.com',
  projectId: 'demo-taskgo',
  appId: 'demo-taskgo-web',
}, 'app-check-enforcement-test');
const auth = getAuth(app);
connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });

try {
  const credential = await createUserWithEmailAndPassword(auth, `app-check-${Date.now()}@example.test`, 'StrongPass123!');
  const idToken = await getIdToken(credential.user);
  for (const name of ['createTask', 'acceptInvite']) {
    const url = `http://127.0.0.1:5001/demo-taskgo/asia-northeast3/${name}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ data: {} }),
    });
    assert.equal(response.status, 401, `${name} must reject a missing App Check token from an authenticated user`);
  }
} finally {
  await signOut(auth);
  await deleteApp(app);
}

console.log('Callable functions rejected authenticated requests missing App Check tokens.');
