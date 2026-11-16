import { setTimeout as delay } from 'node:timers/promises';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { completeOverdueReviews } from '../functions/lib/reviewTimeout.js';
import { sendReviewReminders } from '../functions/lib/reviewNotifications.js';

if (process.env.FIREBASE_PROJECT_ID !== 'demo-taskgo' || process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080') {
  throw new Error('검수 자동 완료 로컬 실행은 demo-taskgo Firestore 에뮬레이터에서만 가능합니다.');
}

const app = initializeApp({ projectId: 'demo-taskgo' }, 'review-timeout-local');
const db = getFirestore(app);
await delay(5000);
for (;;) {
  try {
    const result = await completeOverdueReviews(db);
    if (result.completed || result.skipped || result.hasMore) console.log('검수 자동 완료:', result);
    const reminders = await sendReviewReminders(db);
    if (reminders.sent) console.log('검수 리마인드:', reminders);
  } catch (error) {
    console.error('검수 자동 완료 확인 실패:', error);
  }
  await delay(60_000);
}
