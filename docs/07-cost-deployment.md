# 무료·저비용 검증 운영

## 배포 상태
- 로컬 개발은 Firebase Emulator Suite와 `npm run dev:all`을 사용한다.
- 운영 환경은 `taskgo-jins98` 프로젝트의 Firebase Hosting·Firestore·Functions와 Cloud Run을 사용한다. 실제 배포 결과는 [34일차 기록](daily/day-34.md)에 적는다.

## 포트폴리오 검증용 배포
- Socket.io 서버: Cloud Run **min instances=0, max instances=1** 초기 권장, 요청 기반 과금.
- WebSocket 연결 유지 중 인스턴스 사용량 과금 가능. 요청 시간 제한·자동 재연결 설계.
- 프론트: Firebase Hosting 등 정적 호스팅.
- Firestore/Functions/Storage: 무료 할당량을 우선 활용.
- AI: 명시적 클릭에만 실행, 1인당 호출 제한과 예산 통제.

## Taskgo 배포 절차

실제 프로젝트는 `taskgo-jins98`, Hosting 주소는 `https://taskgo-jins98.web.app`, 리전은 `asia-northeast3`이다. 먼저 청구 계정을 연결하고 이 프로젝트만 포함하는 월간 예산 알림을 만든다. 현재 청구 계정 연결 여부와 배포 상태는 [34일차 기록](daily/day-34.md)에 적는다. 예산 알림은 지출을 중단시키지 않는다.

1. Google Cloud CLI에서 `gcloud auth login`을 완료하고 `gcloud billing projects describe taskgo-jins98`로 결제 연결 상태를 확인한다. 예산은 Google Cloud Console의 **결제 → 예산 및 알림**에서 프로젝트 범위를 `taskgo-jins98`로 지정한다. 청구 계정의 통화와 알림 수신자를 확인하고 10%·50%·100% 알림을 설정한다.
2. `Dockerfile`은 루트 npm workspace에서 소켓 서버만 빌드한다. Cloud Run에는 별도 서비스 계정을 사용하고 Firestore User(`roles/datastore.user`)와 Firebase Authentication Viewer(`roles/firebaseauth.viewer`)를 부여한다. `deploy/cloud-run.env.yaml`에는 공개 웹 Origin 두 개와 Firebase 프로젝트 ID만 기록한다. 배포 환경에 Auth·Firestore 에뮬레이터 변수를 넣지 않는다.
3. 다음 명령으로 소켓 서버를 배포하고 반환된 HTTPS URL의 `/status`를 확인한다. `--min 0 --max 1`은 **서비스 전체** 인스턴스 범위를 지정한다. 긴 WebSocket 연결은 인스턴스 사용 시간을 늘릴 수 있다.

   ```powershell
   gcloud run deploy taskgo-socket --source . --project taskgo-jins98 --region asia-northeast3 --min 0 --max 1 --cpu 1 --memory 512Mi --timeout 900 --allow-unauthenticated --service-account taskgo-socket@taskgo-jins98.iam.gserviceaccount.com --env-vars-file deploy/cloud-run.env.yaml
   gcloud run services describe taskgo-socket --project taskgo-jins98 --region asia-northeast3
   ```

4. Firestore 규칙·인덱스와 Functions를 배포한다. 초대 메일에는 `functions/.env`의 `INVITE_APP_URL=https://taskgo-jins98.web.app`, `INVITE_FROM`과 Secret Manager의 `INVITE_SMTP_URL`이 필요하다. AI 제목 제안에는 `OPENAI_API_KEY` secret이 필요하다. 두 비밀값을 Git이나 웹 환경 변수에 넣지 않는다. 예약 함수는 1분 간격으로 실행되므로 배포 후 비용을 관찰한다.

   ```powershell
   npm run build:functions
   firebase deploy --only firestore,functions --project taskgo-jins98
   ```

5. 소켓 서버 URL을 웹 빌드에 명시적으로 넣고 Hosting에 올린다. `build:prod:web`은 HTTP·localhost 주소를 거부한다. `apps/web/.env.local`의 Firebase 웹 설정은 `taskgo-jins98`를 가리켜야 한다.

   ```powershell
   npm run build:prod:web -- https://CLOUD_RUN_URL
   firebase deploy --only hosting --project taskgo-jins98
   ```

6. `https://taskgo-jins98.web.app`와 `/invite/...` 경로, 로그인·채팅 연결·업무·캘린더·초대 흐름을 실제 브라우저에서 확인한다. Cloud Run의 `Scaling: Auto (Min: 0, Max: 1)`과 예산 알림 상태를 다시 확인한다.

## 비용 보호
- Taskgo 프로젝트에 Blaze 청구 계정을 연결했다. 무료 할당량 초과·네트워크·파일 저장·AI API·예약 작업은 비용 발생 가능.
- Google Cloud 예산 알림: 현재 Taskgo 프로젝트 월 5천 원, 10%·50%·100% 알림으로 설정. **알림은 자동 과금 차단 아님**.
- max=1은 비용 제한의 보조 수단이지 청구 상한 아님.
- 실제 과금 단가·무료 할당량은 배포 시 공식 문서 재확인.
- 검증 기간 외 소켓 서버를 비활성화할지 운영 정책 결정.
- 실제 청구액은 사용량 반영 후 Google Cloud 결제 보고서에서 확인한다. [35일차 운영 검증](daily/day-35.md)에서는 청구액을 측정하지 않았다.
