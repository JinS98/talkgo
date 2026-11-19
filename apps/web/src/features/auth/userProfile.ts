import { useEffect, useState } from 'react';
import { updateProfile, type User } from 'firebase/auth';
import { collection, doc, getDocs, onSnapshot, runTransaction, serverTimestamp, updateDoc, writeBatch, type Firestore } from 'firebase/firestore';

export interface UserProfile {
  displayName: string;
  setupComplete: boolean;
  title: string;
  bio: string;
}

function initialName(authName: string | null): string {
  const existing = authName?.trim().slice(0, 40);
  return existing && existing.length >= 2 ? existing : `팀원-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

export function useUserProfile(db: Firestore, user: User) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const profileRef = doc(db, 'users', user.uid);
    let initializing = false;
    return onSnapshot(profileRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setProfile({ displayName: String(data.displayName || ''), setupComplete: data.setupComplete === true, title: String(data.title || ''), bio: String(data.bio || '') });
        setError('');
      } else if (!initializing) {
        initializing = true;
        void runTransaction(db, async (transaction) => {
          if ((await transaction.get(profileRef)).exists()) return;
          transaction.set(profileRef, { displayName: initialName(user.displayName), setupComplete: false, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        }).catch(() => setError('이름 설정을 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.'));
      }
    }, () => setError('이름 정보를 불러오지 못했습니다. 연결 상태를 확인해 주세요.'));
  }, [db, user.uid, user.displayName]);

  async function saveName(value: string) {
    const displayName = value.trim();
    if (displayName.length < 2 || displayName.length > 40) throw new Error('이름은 2~40자로 입력해 주세요.');
    await updateProfile(user, { displayName });
    const memberships = await getDocs(collection(db, 'users', user.uid, 'workspaces'));
    await Promise.all(memberships.docs.map((item) => updateDoc(doc(db, 'workspaces', item.id, 'members', user.uid), { displayName })));
    await updateDoc(doc(db, 'users', user.uid), { displayName, setupComplete: true, updatedAt: serverTimestamp() });
  }

  async function saveDetails(value: Pick<UserProfile, 'title' | 'bio'>) {
    const title = value.title.trim();
    const bio = value.bio.trim();
    if (title.length > 60 || bio.length > 240) throw new Error('직책은 60자, 소개는 240자 이내로 입력해 주세요.');
    const memberships = await getDocs(collection(db, 'users', user.uid, 'workspaces'));
    const batch = writeBatch(db);
    batch.update(doc(db, 'users', user.uid), { title, bio, updatedAt: serverTimestamp() });
    for (const item of memberships.docs) batch.update(doc(db, 'workspaces', item.id, 'members', user.uid), { title, bio });
    await batch.commit();
  }

  return { profile, error, saveName, saveDetails };
}
