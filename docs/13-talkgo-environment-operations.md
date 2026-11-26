# Talkgo 환경·운영 경계

39일차 읽기 전용 점검 (2026-11-26). [38일차 데이터 이전 설계](12-talkgo-schema-migration.md)의 운영 변경 전 체크리스트다. 이번 점검은 클라우드 설정·비밀값·운영 데이터·배포 리비전을 변경하지 않았다.

## 환경과 식별자

| 구분 | 현재 값과 용도 | 경계 |
| --- | --- | --- |
| 로컬 개발 | Firebase Emulator Suite의 `demo-taskgo`, 웹의 `.env.emulator`, 소켓의 `.env.emulator` | 실제 프로젝트로 요청하지 않음. `npm run dev:all`이 에뮬레이터 환경을 설정 |
| 별도 클라우드 개발/스테이징 | 현재 계정에서 Talkgo/Taskgo 이름의 별도 프로젝트는 확인되지 않음 | 운영과 분리된 클라우드 배포·부하 검증 환경은 아직 없음. 새 기능을 운영에 공개하기 전 분리 환경과 비용·IAM을 정해야 함 |
| 실제 운영 프로젝트 | Firebase/GCP `taskgo-jins98`, Firestore·Auth·Functions·Hosting | **운영 리소스 ID**이므로 Talkgo로 문자열만 바꾸지 않음 |
| 운영 웹 | `https://taskgo-jins98.web.app` | 200 응답, 제목 `Taskgo | t:go`. 새 Talkgo 웹 빌드는 아직 미배포 |
| 운영 실시간 서버 | Cloud Run `taskgo-socket`, `asia-northeast3`; 현재 서비스 URL `https://taskgo-socket-g6zxbop4da-du.a.run.app` | 이전 URL `https://taskgo-socket-320829082391.asia-northeast3.run.app`도 `/status` 200. 두 URL을 이름 변경 대상으로 취급하지 않음 |
| GitHub | `JinS98/talkgo` | 소스 저장소 이름과 클라우드 ID는 서로 독립 |

`apps/web/.env.local`은 이 PC의 운영 Firebase **웹 설정**이며 Git에 포함되지 않는다. `VITE_*` 값은 번들에 포함되므로 SMTP/OpenAI/서비스 계정 키를 넣지 않는다. Firebase 웹 API 키 자체보다 Firestore Rules·App Check·서버 권한이 데이터 보호 경계다. [`build:prod:web`](../scripts/build-production-web.mjs)은 HTTPS 소켓 Origin과 배포 프로젝트 ID를 명시적으로 받고, Vite가 읽는 `VITE_FIREBASE_PROJECT_ID`와 일치하는지 확인한다. `demo-` 대상, 에뮬레이터 모드, 누락된 필수 웹 설정은 빌드 전에 거부한다.

## 실제 리소스 점검

| 항목 | 2026-11-26 확인 결과 | 후속 확인 |
| --- | --- | --- |
| 프로젝트·청구 연결 | `taskgo-jins98` ACTIVE, billingEnabled=true | 결제 보고서의 실제 지출은 이번 점검에서 조회하지 않음 |
| 예산 | 35일차에 이 프로젝트만 포함한 월 5,000원·10/50/100% 알림 확인 | **현재 예산 설정은 재검증 못함.** Billing Budgets 조회는 로컬 ADC quota project 미설정/API 비활성 오류로 실패. 결제 콘솔에서 범위·금액·알림 유형 확인 필요 |
| Cloud Run | `taskgo-socket` ready, 100% 트래픽, 서비스 최대 인스턴스 1, 요청 제한 900초, `/status` 200 | 공개 invoker이지만 소켓 연결은 Firebase 토큰을 검증. 공개 호출 자체는 비용 제한 수단이 아님 |
| Cloud Run 환경 | `FIREBASE_PROJECT_ID=taskgo-jins98`, `SOCKET_ALLOWED_ORIGINS`는 기존 Hosting의 `.web.app`·`.firebaseapp.com` 두 Origin | Talkgo 도메인을 추가할 때 서버 허용 Origin과 웹 빌드를 함께 검증 |
| Cloud Run 계정 | 별도 `taskgo-socket@taskgo-jins98.iam.gserviceaccount.com`; 프로젝트 역할 `roles/datastore.user`, `roles/firebaseauth.viewer` | 역할 확대 없이 필요한 작업만 유지 |
| 프로젝트 IAM | 사용자 Owner 1명, 서비스 계정 Editor 3개; 프로젝트 전체 `allUsers` 바인딩 없음 | 광범위 Editor가 필요한지 출시 전 각 서비스 계정별로 검토. 이번 일차에는 권한 변경 안 함 |
| Functions | Gen 2 함수 11개 ACTIVE; `inviteMember`는 `INVITE_SMTP_URL`, `suggestTask`는 `OPENAI_API_KEY` secret 바인딩 | secret 이름·버전 ENABLED만 확인. **비밀값 내용이나 실제 외부 연동 성공은 확인하지 않음** |
| 초대 메일 | 배포된 `inviteMember`에 `INVITE_APP_URL` 존재, `INVITE_FROM` 없음 | 현재 메일 발송 준비 미완료. 발신 주소·SMTP를 설정한 뒤 실제 수신·수락 검증 |
| 예약 작업 | `completeExpiredReviews` 스케줄 ENABLED, 매 1분 | 실행 수·오류율·비용 모니터링 |
| 로그 | 최근 7일의 Cloud Run 로그 메타데이터(시각·심각도) 조회 성공 | 메시지 본문/토큰은 점검용으로 출력하지 않음. 오류·호출량 추세는 운영 대시보드에서 별도 확인 |

Cloud Run의 서비스 최대 인스턴스 1과 기존 **알림 전용** 예산은 과금 상한으로 취급하지 않는다. 현재 Cloud Billing 예산의 유형도 조회 실패로 확인하지 못했으므로 35일차 기록을 현재 설정이라고 단정하지 않는다.

## 배포 전·후 체크리스트

1. 운영 배포 전에는 `git status`, 대상 커밋, `taskgo-jins98` 프로젝트, 현재 웹의 Firebase 프로젝트 ID, Cloud Run URL·Origin, 서비스 계정을 같은 변경 기록에 적는다. 로컬 에뮬레이터 또는 별도 스테이징에서 권한·회귀 테스트를 먼저 통과시킨다.
2. 운영 데이터 스키마를 바꾸는 날에는 [무손실 이전 순서](12-talkgo-schema-migration.md)의 보존·호환 읽기·Rules·백필·롤백 게이트를 지킨다. 개발/운영 프로젝트를 혼동해 백필을 실행하지 않는다.
3. `npm run build:prod:web -- https://CLOUD_RUN_URL taskgo-jins98`로 빌드한다. 이 명령은 **빌드만** 하며 Hosting에 게시하지 않는다. 빌드 산출물에서 운영 프로젝트·소켓 URL을 확인하고 `demo-taskgo`가 없는지 검사한다.
4. 실제 게시 시 `firebase deploy --only ... --project taskgo-jins98`, `gcloud ... --project taskgo-jins98 --region asia-northeast3`처럼 프로젝트·리전을 매번 명시한다. Cloud Run, Functions, Rules, Hosting 순서와 호환 창을 변경별로 검토한다. 새 Talkgo 화면은 초대·채팅·업무·캘린더 회귀 시연 후 게시한다.
5. 게시 후 Hosting `/`와 초대 경로, Cloud Run `/status`, 로그인·채널·DM, 업무 생성/응답, 보드·캘린더, 390px 화면, Logs 오류, Scheduler, 청구·예산 알림을 확인한다. 비밀값은 로그나 화면 캡처에 출력하지 않는다.
6. 실패 시 게시를 멈추고 변경 종류에 맞는 이전 Hosting 릴리스·Cloud Run 리비전·Functions/Rules 호환 버전으로 돌아간다. 스키마 필드나 운영 문서를 일괄 삭제하지 않는다. 이미 발송된 초대·업무 상태 전이를 무조건 재시도하지 말고 서버 결과를 먼저 확인한다.

## 오류·재시도 경계

- 운영 웹 프로젝트 ID가 명령 인자와 다르면 빌드가 즉시 실패한다. `.env.local`과 대상 프로젝트를 확인한 뒤 다시 빌드한다. API 키·앱 ID는 오류 출력에 포함하지 않는다.
- `INVITE_FROM`이 없으면 메일 설정 오류를 사용자에게 보여 주고 초대 문서를 만들기 전에 중단한다. 발신 설정이 완료되기 전에는 발송 성공으로 표시하지 않는다.
- 웹 로그인/프로필 구독 실패에는 오류와 다시 시도를, 워크스페이스 목록 실패에는 빈 공간 화면 대신 재시도를, 채팅 연결 실패에는 다시 연결을 표시한다. 권한 거부는 환경 오류로 자동 재전송하지 않는다.
- Billing Budgets API 조회 실패는 예산이 없다는 뜻이 아니다. 현재값은 미확인으로 남기고 결제 콘솔 또는 적절한 quota project/API 설정을 갖춘 별도 읽기 경로에서 확인한다.

참고: [Vite 환경 변수 우선순위](https://v6.vite.dev/guide/env-and-mode.html), [Firebase 웹 API 키와 데이터 보호](https://firebase.google.com/docs/projects/api-keys), [Cloud Run 최대 인스턴스](https://docs.cloud.google.com/run/docs/configuring/max-instances), [Cloud Billing 예산](https://docs.cloud.google.com/billing/docs/how-to/budgets).
