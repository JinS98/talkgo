import assert from 'node:assert/strict';
import { initializeApp as initializeAdminApp, deleteApp as deleteAdminApp } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore, Timestamp } from 'firebase-admin/firestore';
import { initializeApp, deleteApp } from 'firebase/app';
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, getIdToken, GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { collection, connectFirestoreEmulator, doc, getFirestore, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';

process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';
const authPort = Number(process.env.FIREBASE_AUTH_EMULATOR_HOST.split(':').at(-1));
const firestorePort = Number(process.env.FIRESTORE_EMULATOR_HOST.split(':').at(-1));
const functionsPort = Number(process.env.VITE_FUNCTIONS_EMULATOR_PORT || 5001);
const projectId = 'demo-taskgo';
const adminApp = initializeAdminApp({ projectId }, 'workspace-test-admin');
const adminDb = getAdminFirestore(adminApp);
const apps = [];
let rules;

async function account(name, email) {
  const app = initializeApp({ apiKey: 'demo-taskgo-key', authDomain: 'demo-taskgo.firebaseapp.com', projectId, appId: 'demo-taskgo-web' }, name);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://127.0.0.1:${authPort}`, { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', firestorePort);
  const functions = getFunctions(app, 'asia-northeast3');
  connectFunctionsEmulator(functions, '127.0.0.1', functionsPort);
  const { user } = await createUserWithEmailAndPassword(auth, email, 'StrongPass123!');
  const call = (name, data) => httpsCallable(functions, name)(data);
  return { user, auth, db, call };
}

async function createWorkspace(account, name, type) {
  await getIdToken(account.user, true);
  const workspace = doc(collection(account.db, 'workspaces'));
  const batch = writeBatch(account.db);
  batch.set(workspace, { name, ...(type === undefined ? {} : { type }), ownerId: account.user.uid, createdAt: serverTimestamp() });
  batch.set(doc(account.db, 'workspaces', workspace.id, 'members', account.user.uid), { uid: account.user.uid, email: account.user.email, role: 'owner', joinedAt: serverTimestamp() });
  batch.set(doc(account.db, 'users', account.user.uid, 'workspaces', workspace.id), { workspaceId: workspace.id, name, role: 'owner', joinedAt: serverTimestamp() });
  await batch.commit();
  return workspace.id;
}

async function rejected(promise, code) {
  await assert.rejects(promise, (error) => error.code === `functions/${code}`);
}

try {
  const owner = await account('owner', 'owner@example.com');
  const googleApp = initializeApp({ apiKey: 'demo-taskgo-key', authDomain: 'demo-taskgo.firebaseapp.com', projectId, appId: 'demo-taskgo-web' }, 'google-owner');
  apps.push(googleApp);
  const googleAuth = getAuth(googleApp);
  connectAuthEmulator(googleAuth, `http://127.0.0.1:${authPort}`, { disableWarnings: true });
  const googleDb = getFirestore(googleApp);
  connectFirestoreEmulator(googleDb, '127.0.0.1', firestorePort);
  const googleUser = (await signInWithCredential(googleAuth, GoogleAuthProvider.credential(JSON.stringify({ sub: 'workspace-google-owner', email: 'google-owner@gmail.com', email_verified: true })))).user;
  const googleWorkspaceId = await createWorkspace({ user: googleUser, db: googleDb }, 'Google Team');
  assert.equal((await adminDb.doc(`workspaces/${googleWorkspaceId}`).get()).get('ownerId'), googleUser.uid);
  const guest = await account('guest', 'guest@example.com');
  const stranger = await account('stranger', 'stranger@gmail.com');
  const unverified = await account('unverified', 'unverified@gmail.com');
  const revokeGuest = await account('revoke-guest', 'revoke-guest@example.com');

  assert.equal(owner.user.emailVerified, false);
  const unverifiedWorkspaceId = await createWorkspace(unverified, 'Immediate Team');
  assert.equal((await adminDb.doc(`workspaces/${unverifiedWorkspaceId}`).get()).get('ownerId'), unverified.user.uid);
  const workspaceId = await createWorkspace(owner, 'Talkgo Team');
  const workWorkspaceId = await createWorkspace(owner, 'New Work Team', 'work');
  const meetupWorkspaceId = await createWorkspace(owner, 'Weekend Group', 'meetup');
  assert.equal((await adminDb.doc(`workspaces/${workWorkspaceId}`).get()).get('type'), 'work');
  assert.equal((await adminDb.doc(`workspaces/${meetupWorkspaceId}`).get()).get('type'), 'meetup');
  assert.equal((await adminDb.doc(`users/${owner.user.uid}/workspaces/${meetupWorkspaceId}`).get()).get('type'), undefined);
  for (const invalidType of [null, '', 'unknown']) {
    await assert.rejects(createWorkspace(owner, 'Invalid Type', invalidType), (error) => error.code === 'permission-denied');
  }
  assert.equal((await adminDb.collection('workspaceInvites').get()).size, 0);
  await assert.rejects(setDoc(doc(collection(owner.db, 'workspaces')), { name: 'Incomplete', ownerId: owner.user.uid, createdAt: serverTimestamp() }), (error) => error.code === 'permission-denied');
  assert.equal((await adminDb.doc(`workspaces/${workspaceId}`).get()).get('ownerId'), owner.user.uid);
  assert.equal((await adminDb.doc(`workspaces/${workspaceId}/members/${owner.user.uid}`).get()).get('role'), 'owner');

  await rejected(guest.call('inviteMember', { workspaceId, email: 'stranger@gmail.com' }), 'permission-denied');
  await rejected(owner.call('inviteMember', { workspaceId, email: 'invalid-email' }), 'invalid-argument');
  const first = (await owner.call('inviteMember', { workspaceId, email: 'guest@example.com' })).data;
  assert.ok(first.link);
  const firstToken = new URL(first.link).searchParams.get('token');
  await rejected(guest.call('revokeInvite', { inviteId: first.inviteId }), 'permission-denied');
  await owner.call('revokeInvite', { inviteId: first.inviteId });
  await rejected(guest.call('acceptInvite', { inviteId: first.inviteId, token: firstToken }), 'failed-precondition');

  const second = (await owner.call('inviteMember', { workspaceId, email: 'guest@example.com' })).data;
  const secondToken = new URL(second.link).searchParams.get('token');
  await rejected(stranger.call('acceptInvite', { inviteId: second.inviteId, token: secondToken }), 'permission-denied');
  await rejected(unverified.call('acceptInvite', { inviteId: second.inviteId, token: secondToken }), 'permission-denied');
  await rejected(guest.call('acceptInvite', { inviteId: second.inviteId, token: 'x'.repeat(43) }), 'permission-denied');
  assert.equal((await guest.call('acceptInvite', { inviteId: second.inviteId, token: secondToken })).data.workspaceId, workspaceId);
  await rejected(guest.call('acceptInvite', { inviteId: second.inviteId, token: secondToken }), 'failed-precondition');
  assert.equal((await adminDb.doc(`workspaces/${workspaceId}/members/${guest.user.uid}`).get()).get('role'), 'member');
  await rejected(owner.call('createDm', { workspaceId, memberId: owner.user.uid }), 'invalid-argument');
  await rejected(unverified.call('createDm', { workspaceId, memberId: guest.user.uid }), 'permission-denied');
  const directRoomId = (await owner.call('createDm', { workspaceId, memberId: guest.user.uid })).data.roomId;
  assert.equal((await guest.call('createDm', { workspaceId, memberId: owner.user.uid })).data.roomId, directRoomId);
  assert.equal((await owner.call('createDm', { workspaceId, memberId: guest.user.uid })).data.roomId, directRoomId);
  assert.deepEqual((await adminDb.doc(`dmRooms/${directRoomId}`).get()).get('participantIds').sort(), [owner.user.uid, guest.user.uid].sort());

  const expired = (await owner.call('inviteMember', { workspaceId, email: 'stranger@gmail.com' })).data;
  await adminDb.doc(`workspaceInvites/${expired.inviteId}`).update({ expiresAt: Timestamp.fromMillis(Date.now() - 1000) });
  await rejected(stranger.call('acceptInvite', { inviteId: expired.inviteId, token: new URL(expired.link).searchParams.get('token') }), 'deadline-exceeded');
  const race = (await owner.call('inviteMember', { workspaceId, email: 'stranger@gmail.com' })).data;
  const raceData = { inviteId: race.inviteId, token: new URL(race.link).searchParams.get('token') };
  const results = await Promise.allSettled([stranger.call('acceptInvite', raceData), stranger.call('acceptInvite', raceData)]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
  assert.equal((await adminDb.doc(`workspaceInvites/${race.inviteId}`).get()).get('status'), 'accepted');

  const revokeRace = (await owner.call('inviteMember', { workspaceId, email: revokeGuest.user.email })).data;
  const revokeRaceResults = await Promise.allSettled([
    owner.call('revokeInvite', { inviteId: revokeRace.inviteId }),
    revokeGuest.call('acceptInvite', { inviteId: revokeRace.inviteId, token: new URL(revokeRace.link).searchParams.get('token') }),
  ]);
  assert.equal(revokeRaceResults.filter((result) => result.status === 'fulfilled').length, 1);
  const revokeRaceStatus = (await adminDb.doc(`workspaceInvites/${revokeRace.inviteId}`).get()).get('status');
  assert.ok(['accepted', 'revoked'].includes(revokeRaceStatus));
  assert.equal((await adminDb.doc(`workspaces/${workspaceId}/members/${revokeGuest.user.uid}`).get()).exists, revokeRaceStatus === 'accepted');

  rules = await initializeTestEnvironment({ projectId, firestore: { host: '127.0.0.1', port: firestorePort } });
  const ownerDb = rules.authenticatedContext(owner.user.uid).firestore();
  const guestDb = rules.authenticatedContext(guest.user.uid).firestore();
  const unknownDb = rules.authenticatedContext(unverified.user.uid).firestore();
  const publicDb = rules.unauthenticatedContext().firestore();
  const workspacePath = `workspaces/${workspaceId}`;
  await assertSucceeds(ownerDb.doc(workspacePath).get());
  await assertSucceeds(guestDb.doc(workspacePath).get());
  await assertSucceeds(ownerDb.collection(`${workspacePath}/members`).get());
  const ownerProfile = ownerDb.doc(`users/${owner.user.uid}`);
  await adminDb.doc(`users/${owner.user.uid}`).set({ displayName: '테스트 방장', setupComplete: true, createdAt: Timestamp.now(), updatedAt: Timestamp.now() });
  await assertSucceeds(ownerProfile.get());
  await assertFails(guestDb.doc(`users/${owner.user.uid}`).get());
  await assertSucceeds(updateDoc(doc(owner.db, 'users', owner.user.uid), { title: '기획', bio: '팀 소개', updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(owner.db, 'users', owner.user.uid), { bio: 'x'.repeat(241), updatedAt: serverTimestamp() }));
  await assertSucceeds(ownerDb.doc(`${workspacePath}/members/${owner.user.uid}`).update({ displayName: '변경한 방장' }));
  await assertSucceeds(ownerDb.doc(`${workspacePath}/members/${owner.user.uid}`).update({ title: '기획', bio: '팀 소개' }));
  await assertFails(guestDb.doc(`${workspacePath}/members/${owner.user.uid}`).update({ bio: '위조' }));
  await assertFails(guestDb.doc(`${workspacePath}/members/${owner.user.uid}`).update({ displayName: '위조' }));
  await assertFails(ownerDb.doc(`${workspacePath}/members/${owner.user.uid}`).update({ role: 'member' }));
  await assertFails(unknownDb.doc(workspacePath).get());
  await assertFails(publicDb.doc(workspacePath).get());
  await adminDb.doc(`${workspacePath}/members/malformed`).set({ uid: 'malformed', role: 'guest' });
  await assertFails(rules.authenticatedContext('malformed').firestore().doc(workspacePath).get());
  await assertFails(ownerDb.doc(`workspaces/${unverifiedWorkspaceId}`).get());
  await assertFails(ownerDb.collection(`workspaces/${unverifiedWorkspaceId}/members`).get());
  await assertSucceeds(unknownDb.doc(`workspaces/${unverifiedWorkspaceId}`).get());
  await assertSucceeds(guestDb.doc(`users/${guest.user.uid}/workspaces/${workspaceId}`).get());
  await assertFails(ownerDb.doc(`users/${guest.user.uid}/workspaces/${workspaceId}`).get());
  await assertFails(guestDb.doc(`workspaceInvites/${second.inviteId}`).get());
  await assertFails(ownerDb.doc(`workspaceInvites/${second.inviteId}`).get());

  await adminDb.doc('channels/general').set({ workspaceId, name: 'general' });
  await adminDb.doc('dmRooms/private').set({ workspaceId, participantIds: [owner.user.uid, stranger.user.uid] });
  await adminDb.doc('messages/channel-message').set({ workspaceId, sourceType: 'channel', channelId: 'general', content: 'public to members' });
  await adminDb.doc('messages/dm-message').set({ workspaceId, sourceType: 'dm', dmRoomId: 'private', content: 'private' });
  await adminDb.doc('tasks/sample').set({ workspaceId, title: 'Visible task metadata', sourceMessageId: 'dm-message' });
  await adminDb.doc('meetings/sample').set({ workspaceId, title: 'Team meeting' });
  await adminDb.doc('meetupProposals/sample').set({ workspaceId, title: 'Private proposal' });
  await adminDb.doc('meetupProposals/sample/votes/1_owner').set({ voterId: owner.user.uid, choice: 'YES' });
  await adminDb.doc('meetupEvents/sample').set({ workspaceId, title: 'Private event' });
  await adminDb.doc('meetupSeries/sample').set({ workspaceId, title: 'Private series' });
  await assertSucceeds(guestDb.doc('channels/general').get());
  await assertFails(unknownDb.doc('channels/general').get());
  await assertSucceeds(guestDb.doc('messages/channel-message').get());
  await assertFails(guestDb.doc('messages/dm-message').get());
  await assertSucceeds(ownerDb.doc('messages/dm-message').get());
  await assertSucceeds(ownerDb.collection('messages').where('workspaceId', '==', workspaceId).where('sourceType', '==', 'dm').where('dmRoomId', '==', 'private').get());
  await assertFails(guestDb.collection('messages').where('workspaceId', '==', workspaceId).where('sourceType', '==', 'dm').where('dmRoomId', '==', 'private').get());
  await assertFails(guestDb.collection('messages').where('workspaceId', '==', workspaceId).get());
  await assertSucceeds(ownerDb.doc('dmRooms/private').get());
  await assertFails(guestDb.doc('dmRooms/private').get());
  await assertSucceeds(guestDb.doc('tasks/sample').get());
  await assertFails(unknownDb.doc('tasks/sample').get());
  await assertFails(rules.authenticatedContext('malformed').firestore().doc('tasks/sample').get());
  await assertSucceeds(guestDb.doc('meetings/sample').get());
  await assertFails(unknownDb.doc('meetings/sample').get());
  await assertFails(unknownDb.doc('channels/general').get());
  for (const path of ['meetupProposals/sample', 'meetupProposals/sample/votes/1_owner', 'meetupEvents/sample', 'meetupSeries/sample']) {
    await assertFails(ownerDb.doc(path).get());
    await assertFails(guestDb.doc(path).get());
    await assertFails(publicDb.doc(path).get());
    await assertFails(ownerDb.doc(path).set({ workspaceId, title: 'forged' }));
  }
  await assertFails(ownerDb.doc('messages/channel-message').set({ workspaceId, content: 'forged' }));
  await assertFails(guestDb.doc(workspacePath).update({ ownerId: guest.user.uid }));
  await assertFails(ownerDb.doc(workspacePath).update({ type: 'meetup' }));
  await assertFails(ownerDb.doc(`workspaces/${workWorkspaceId}`).update({ type: 'meetup' }));
  await rejected(guest.call('listInvites', { workspaceId }), 'permission-denied');
  const listedInvites = (await owner.call('listInvites', { workspaceId })).data.invites;
  assert.ok(listedInvites.length >= 4);
  assert.deepEqual(Object.keys(listedInvites[0]).sort(), ['email', 'expiresAt', 'inviteId', 'status']);

  await adminDb.doc(`${workspacePath}/members/${guest.user.uid}`).delete();
  await assertFails(guestDb.doc(workspacePath).get());
  await assertFails(guestDb.doc('messages/channel-message').get());
  await assertFails(guestDb.doc('tasks/sample').get());
  await assertSucceeds(ownerDb.doc('tasks/sample').get());
  await assertFails(guestDb.doc('meetings/sample').get());

  await adminDb.doc(`${workspacePath}/members/${owner.user.uid}`).delete();
  await rejected(owner.call('listInvites', { workspaceId }), 'permission-denied');
  await rejected(owner.call('inviteMember', { workspaceId, email: 'new@example.com' }), 'permission-denied');
  await rejected(owner.call('revokeInvite', { inviteId: expired.inviteId }), 'permission-denied');

  console.log('Workspace creation, invitation lifecycle/races, DM queries, calendar reads, and revoked membership rules passed.');
} finally {
  if (rules) await rules.cleanup();
  for (const app of apps) await deleteApp(app);
  await deleteAdminApp(adminApp);
}
