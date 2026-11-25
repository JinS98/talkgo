# 36일차 — Talkgo 브랜드·기준선

- 이전: [35일차](day-35.md) / 다음: [37일차](day-37.md)
- 상태: 브랜드·기획 기준선 완료 (2026-11-25)
- 근거: [현재 코드와 Talkgo 기획 차이](../11-talkgo-expansion.md)

## 작업

- 현재 UI·패키지명·로고 교체, 35일차 구현 범위와 Notion 기획 차이 기록.
- 운영 리소스 식별자와 브랜드 문자열을 구분하고 원격 저장소 이름·주소를 확인한다.

## 완료 기준

- 웹 제목·로그인·사이드바·파비콘·npm 작업공간이 Talkgo로 표시되고 기존 업무 빌드가 통과.
- 기획과 현재 코드 차이를 문서화하고 타입 검사·린트·웹/서버 빌드·기본 UI 테스트를 통과한다.

## 검증 기록

- `npm run typecheck`, `npm run lint`, `npm run build:web`, `npm run build:functions`, `npm run build:socket`, `npm run test:ui` 통과.
- GitHub 저장소 `JinS98/talkgo`와 로컬 `origin` 주소 확인. 운영 Firebase 프로젝트와 Hosting URL은 기존 식별자를 유지하며 새 웹 빌드는 아직 배포하지 않았다.
