# 39일차 환경·운영 경계

- 이전: [38일차](day-38.md) / 다음: [40일차](day-40.md)
- 상태: 완료 (2026-11-26)
- 근거: [현재 코드와 Talkgo 기획 차이](../11-talkgo-expansion.md)

## 작업

- 개발·운영 Firebase, IAM, Secret Manager, 예산·로그·배포 경로를 점검한다.
- 기존 업무의 동작·데이터 접근 범위를 확인하고 해당 기능의 서버 검증과 화면 상태를 함께 갱신한다.

## 완료 기록

- 로컬 에뮬레이터(`demo-taskgo`)와 실제 운영 프로젝트(`taskgo-jins98`)를 분리해 확인했다. 현재 로그인된 계정에서 별도 클라우드 스테이징 프로젝트는 확인되지 않았다. Hosting은 기존 Taskgo 버전이다.
- 운영 Cloud Run, Functions 11개, Scheduler, 서비스 계정과 IAM 역할, Secret Manager 바인딩 이름을 읽기 전용으로 확인했다. 비밀값은 열람하거나 문서에 남기지 않았다.
- 운영 웹 빌드가 배포 대상 Firebase 프로젝트 ID를 명시적으로 받고, 실제 Vite 설정과 불일치하거나 `demo-` 프로젝트·에뮬레이터 설정이면 실패하도록 했다. [배포 안내](../07-cost-deployment.md)에도 새 명령을 반영했다.
- 기존 업무의 권한·오류·재시도 경로는 [38일차 검증](day-38.md)과 현재 코드를 대조하고, 운영 점검 항목과 배포 순서를 [환경·운영 경계 문서](../13-talkgo-environment-operations.md)에 정리했다. 이 일차에 운영 데이터나 서비스는 변경하지 않았다.

## 검증과 남은 운영 확인

- `demo-taskgo` 인자와 불일치하는 프로젝트 ID는 운영 빌드 시작 전에 거부됨을 확인했다. `taskgo-jins98`와 운영 Cloud Run HTTPS Origin을 지정한 웹 빌드가 통과했고 산출물에 `demo-taskgo`가 포함되지 않음을 확인했다.
- `npm run test:ui` 통과: 공통 탐색 상태, 화면 전환, 대화 선택.
- 운영 Hosting과 Cloud Run `/status`는 HTTP 200이었다. 새 Talkgo 화면의 운영 배포·실사용 시연을 뜻하지 않는다.
- 청구 계정 연결은 확인했다. 현재 예산 설정은 Billing Budgets API 조회 환경 오류로 재확인하지 못했다. 이전 5,000원 예산 기록만 있으며, 운영 콘솔에서 금액·범위·알림을 다시 확인해야 한다.
- `INVITE_SMTP_URL`, `OPENAI_API_KEY`는 Secret Manager 바인딩과 활성 버전만 확인했다. 실제 값·외부 메일 발송·AI 응답 성공은 검증하지 않았다. 배포된 초대 함수에는 `INVITE_FROM` 설정이 없어 메일 발송 준비가 남아 있다.
