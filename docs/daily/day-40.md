# 40일차 — App Check·Rules 기반

- 이전: [39일차](day-39.md) / 다음: [41일차](day-41.md)
- 상태: 완료 (2026-11-26, 로컬 검증)
- 근거: [현재 코드와 Talkgo 기획 차이](../11-talkgo-expansion.md)

## 작업

- App Check 단계 적용과 기본 거부·멤버십·DM 접근 규칙 보강.
- 기존 업무용 동작·데이터 접근 범위를 확인하며 해당 기능의 서버 검증과 화면 상태를 함께 갱신한다.

## 완료 기록

- 웹에 reCAPTCHA Enterprise App Check 초기화를 추가했다. 공개 사이트 키가 설정된 실제 Firebase 환경에서만 활성화하고 에뮬레이터는 건너뛴다. 호출형 Functions 10개에는 `TALKGO_ENFORCE_APP_CHECK=true`일 때 토큰 검증을 강제하는 옵션을 적용했다. 기본값은 `false`다.
- 모임 제안·투표·확정 일정·반복 일정 Firestore 경로를 명시적으로 기본 거부했다. 기존 채널·DM·업무·회의 접근에는 멤버 문서 존재뿐 아니라 `owner`/`member` 역할 검사도 적용했다.
- 로컬 에뮬레이터에서 미로그인 사용자, 다른 공간의 멤버, DM 비참여자의 읽기와 클라이언트 직접 쓰기를 차단하는지 확인했다. 새 모임 경로는 공간 멤버에게도 읽기·쓰기가 거부됐다. 기존 공간 생성·초대·업무 흐름은 회귀 테스트를 통과했다.
- 운영 적용 순서와 아직 확인하지 않은 실제 App Check 증명·서비스 지표를 [App Check·Rules 운영 문서](../14-talkgo-app-check-rules.md)에 정리했다. 이번 일차에는 운영 설정 변경이나 배포를 하지 않았다.

## 검증 결과

| 검증 | 결과 |
| --- | --- |
| `npm run typecheck`, `npm run lint`, `npm run build:web`, `npm run test:ui` | 통과. 웹 App Check 모듈 번들 및 기존 탐색 상태 확인 |
| JDK 21 `npm run test:firebase` | 통과. 에뮬레이터 Firebase 연결과 기본 거부 확인 |
| JDK 21 `npm run test:workspace` | 통과. 공간·초대·DM·업무·회의와 미로그인·타 공간·잘못된 역할·모임 경로 차단 |
| JDK 21 `npm run test:task-model` | 통과. 기존 업무 생성·상태 전이 권한 |
| JDK 21 에뮬레이터, `TALKGO_ENFORCE_APP_CHECK=true`, `verify-app-check.mjs` | 통과. 인증된 사용자의 `createTask`·`acceptInvite` 요청에서 App Check 토큰이 없으면 401로 거부 |

에뮬레이터는 임의의 App Check 헤더 값을 유효하다고 취급하므로 무효 토큰 거부는 여기서 검증했다고 주장하지 않는다. App Check의 실제 reCAPTCHA 증명 성공, 운영 웹에서의 토큰 전송 비율, Firestore 강제 적용 결과도 아직 검증하지 않았다. 운영에서 강제를 켜기 전 실제 웹 앱 등록과 지표 확인이 필요하다.
