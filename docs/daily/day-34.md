# 34일차 — 무료 운영 배포

- 이전: [33일차](day-33.md) / 다음: [35일차](day-35.md)
- **현재 상태: 완료 (초대 메일·AI 외부 연동 설정 대기)**

## 목표

Cloud Run min=0/max=1, 월간 예산 알림, 운영 웹 배포.

## 완료한 작업

- `taskgo-jins98` Firebase 프로젝트에 Blaze 청구 계정을 연결하고, 해당 프로젝트만 포함하는 **월 5,000원** 예산 알림을 만들었다. 실제 지출 10%·50%·100%에 알림이 발송된다. 예산 알림은 과금을 자동으로 차단하지 않는다.
- 소켓 서버를 Docker 이미지로 빌드해 서울 리전의 Cloud Run `taskgo-socket` 서비스에 배포했다. 서비스 전체 **최소 0·최대 1개 인스턴스**, 1 vCPU, 512 MiB, 요청 제한 900초다. 별도 서비스 계정에 Firestore와 Firebase Auth 조회 권한을 부여하고, 브라우저 Origin은 운영 Hosting 도메인 두 개로 제한했다.
- Firestore 보안 규칙과 복합 인덱스 5개, Gen 2 Functions 11개를 배포했다. 모든 함수가 ACTIVE이며 복합 인덱스가 READY임을 확인했다. `completeExpiredReviews`는 1분 간격 예약 실행된다.
- Firebase Hosting에 프로덕션 웹을 게시했다. 빌드 시 운영 Cloud Run HTTPS 주소와 Firebase 운영 프로젝트 설정을 사용하고, Hosting에서 앱 내부 경로를 `index.html`로 연결했다.
- Cloud Run 배포 진단을 위해 만들었던 임시 `taskgo-chat` 서비스는 검증 후 삭제했다.

## 검증 URL

- 웹: https://taskgo-jins98.web.app
- 소켓 서버: https://taskgo-socket-320829082391.asia-northeast3.run.app
- 상태: https://taskgo-socket-320829082391.asia-northeast3.run.app/status

## 검증 결과

- `npm run build:web`, `npm run build:socket`, `npm run build:functions`, `npm run lint` 통과. 운영 웹 빌드도 통과했다.
- 운영 웹 `/`와 `/invite/test?token=test`가 HTTP 200을 반환하며, 후자는 SPA 화면으로 연결된다.
- Chrome headless에서 운영 로그인 화면의 제목과 본문을 확인했고 JavaScript 페이지 오류는 없었다.
- Cloud Run `/status`가 HTTP 200과 `{"status":"ok","protocolVersion":1}`을 반환했다. 허용 Origin의 Socket.IO handshake는 200, 허용하지 않은 Origin은 403이었다. 잘못된 Firebase 토큰을 넣은 연결은 `UNAUTHENTICATED`로 거절되었다.
- 청구 연결 활성화, 예산 알림 범위와 금액, Cloud Run 최신 리비전의 100% 트래픽, 최대 인스턴스 1, Functions ACTIVE, Firestore 인덱스 READY를 확인했다.

## 남은 외부 설정과 다음 일차

- 초대 메일의 `INVITE_SMTP_URL` secret은 임시 비활성 값이며 `INVITE_FROM`이 없다. 사용자에게 사용할 메일 서비스와 발신 주소를 확인한 뒤 설정해야 한다. 그전에는 `inviteMember`가 초대 문서를 만들기 전에 설정 오류를 반환한다.
- AI 초안의 `OPENAI_API_KEY` secret은 임시 비활성 값이다. 실제 키를 설정하기 전에는 수동 업무 작성만 가능하다. 비밀값은 저장소에 넣지 않는다.
- 운영 환경에서 실제 계정 2개를 이용한 로그인·초대·채팅·업무·캘린더 시연은 [35일차](day-35.md)에서 진행한다. 현재 검증은 공개 화면과 서비스 상태·권한 거절까지다.

## 포트폴리오 기록

- 문제 정의: 로컬 전용 협업 도구를 공개 주소에서 실행하면서 비용 증가를 관찰할 수 있어야 했다.
- 선택한 접근: 정적 웹은 Firebase Hosting, 상태를 가진 실시간 통신은 Cloud Run, 데이터와 서버 로직은 Firebase에 배포했다.
- 검증 근거: 운영 URL의 HTTP 응답, 브라우저 페이지 오류 0건, Cloud Run Socket.IO 응답 및 Origin·토큰 거절, Google Cloud 배포 상태 조회.
