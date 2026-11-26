# Talkgo App Check·Rules 단계 적용

40일차 구현 기록 (2026-11-26). 이 문서는 코드에 준비된 보호 경계와 운영에서 아직 켜지 않은 차단 설정을 구분한다. 운영 Firebase 프로젝트는 `taskgo-jins98`이며, 이번 작업에서 운영 App Check 등록·강제 적용·Rules 배포는 하지 않았다.

## 현재 코드 경계

- 웹은 `VITE_RECAPTCHA_ENTERPRISE_SITE_KEY`가 설정되고 에뮬레이터 모드가 아닐 때 Firebase 서비스 사용 전에 reCAPTCHA Enterprise App Check를 초기화하고 토큰을 자동 갱신한다. 사이트 키는 클라이언트에 공개되는 값이다. 설정이 없으면 기존 로그인·Firestore·Functions 경로를 유지한다.
- 호출형 Functions 10개는 `TALKGO_ENFORCE_APP_CHECK=true`일 때 누락·무효 토큰을 거부한다. 기본값은 `false`다. 에뮬레이터의 기존 회귀 테스트는 기본값으로 실행하고, [토큰 차단 검사](../apps/web/scripts/verify-app-check.mjs)는 플래그를 켜서 따로 실행한다.
- Firestore Rules는 멤버 문서의 `owner`/`member` 역할, DM 참여자, 알림 수신자 범위를 확인한다. 잘못된 역할의 멤버 문서는 접근 권한을 주지 않는다. 새 `meetupProposals`(하위 `votes` 포함), `meetupEvents`, `meetupSeries`는 서버 검증과 참가자별 조회가 구현될 때까지 읽기·쓰기를 명시적으로 거부한다. 이는 [38일차 데이터 계약](12-talkgo-schema-migration.md)의 보류 경계다.
- App Check는 사용자 인증이나 멤버십 검사를 대신하지 않는다. Firestore Rules는 App Check 토큰 자체를 검사하지 않으며, Cloud Run 소켓은 이 설정으로 자동 보호되지 않는다. 소켓의 Firebase ID 토큰·멤버십 검사는 유지한다.

## 운영 적용 순서

1. `taskgo-jins98`의 실제 웹 앱을 Firebase App Check에 reCAPTCHA Enterprise로 등록하고 Hosting 도메인을 해당 사이트 키에 연결한다. 키를 웹 빌드 환경의 `VITE_RECAPTCHA_ENTERPRISE_SITE_KEY`에 넣는다. 로컬·CI에서 운영 Firebase에 접속해야 한다면 Firebase가 허용한 디버그 토큰을 별도로 등록하고 비밀로 보관한다. 에뮬레이터에는 사이트 키가 필요 없다.
2. **강제 적용 없이** 웹을 배포해 로그인, 워크스페이스, 초대, 채널·DM, 업무·회의, 보드·캘린더를 실제 계정으로 확인한다. App Check의 Firestore·Functions 검증/미검증 요청 비율과 오류를 살핀다. 기존 Taskgo 웹 버전이 함께 제공되는 동안 강제를 켜면 구버전 사용자의 요청이 막힐 수 있다.
3. 정상 요청에 토큰이 붙고 비정상 차단 범위를 확인한 뒤, Functions 환경에 `TALKGO_ENFORCE_APP_CHECK=true`를 설정해 호출형 함수만 다시 배포한다. 미검증 요청 401, 기존 초대·업무 요청의 정상 경로, 지연·오류를 확인한다. 문제가 있으면 이 값을 `false`로 되돌려 재배포한다.
4. Firestore App Check는 콘솔에서 별도로 강제한다. 강제 후에는 미검증 Firestore 요청이 거부되므로 기존 클라이언트, 로컬 직접 접속, 관리자 도구의 사용 경로를 먼저 점검한다. 문제가 있으면 콘솔에서 강제를 해제한다. Firestore Rules의 멤버십·DM 조건은 그대로 유지한다.
5. 모임 컬렉션 조회 허용은 제안·투표·일정 서버 검증과 참가자 범위 쿼리 테스트가 생긴 뒤 해당 일차에서 개별적으로 연다. 기본 거부 규칙을 임시로 넓히지 않는다.

## 로컬 검증

JDK 21을 지정하고 `demo-taskgo` 에뮬레이터에서 `npm run test:workspace`를 실행한다. 이 테스트는 미로그인·타 공간의 문서 읽기, 비참여 DM, 직접 쓰기, 모임 경로 읽기·쓰기를 차단하고 기존 공간 생성·초대·업무·회의 경로를 확인한다.

App Check 토큰 차단 경로는 Functions를 빌드한 뒤 환경 변수 `TALKGO_ENFORCE_APP_CHECK=true`로 `firebase emulators:exec --only auth,firestore,functions --project demo-taskgo "node apps/web/scripts/verify-app-check.mjs"`를 실행한다. 이 검사는 인증된 사용자의 **토큰 누락 거부**만 확인한다. 현재 에뮬레이터는 임의의 App Check 헤더 문자열도 `VALID`로 취급하므로 무효 토큰 거부를 입증하지 못한다. 실제 reCAPTCHA 증명 성공, 무효 토큰 차단, 운영 트래픽 비율은 운영 강제 적용 전에 별도로 확인해야 한다.

참고: [Firebase 웹 App Check 설정](https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider), [Functions 강제 적용](https://firebase.google.com/docs/app-check/cloud-functions), [Firestore 등 강제 적용](https://firebase.google.com/docs/app-check/enable-enforcement), [디버그 토큰](https://firebase.google.com/docs/app-check/web/debug-provider).
