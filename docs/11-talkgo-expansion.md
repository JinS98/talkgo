# Talkgo 확장 구현 계획 — 35일차 코드 기준

기획 출처: [Talkgo 업무·모임 통합 메신저 기획](https://app.notion.com/p/Talkgo-422c883fa202817881fadbd1c2eea1db) (2026-11-25 확인). 1~35일차는 Taskgo 업무용 MVP 구현·운영 검증의 기록이다. 이 문서는 해당 코드를 재사용하면서 업무용과 모임용을 함께 제공하기 위한 **미구현 작업 계획**이다. 일차별 순서는 [36일차 이후 로드맵](00-roadmap.md)에 따른다.

## 현재 코드와 변경 범위

| 영역 | 35일차 현재 구현 | 수정·추가할 작업 |
|---|---|---|
| 브랜드·구성 | Taskgo 표기, `@taskgo/*`, `t:go` 파비콘, 단일 업무 중심 UI | Talkgo 이름·로고·패키지명으로 교체. Firebase 프로젝트 ID·기존 운영 URL·데이터 경로는 별도 이전 계획이 승인될 때까지 유지 |
| 워크스페이스 | 생성·초대·멤버십, 단일 업무용 정책. `WorkspaceGate.tsx`, `workspaceApi.ts`, `firestore.rules` | `type: work/meetup`, 유형별 홈·권한·초대·탐색. 기존 문서는 `work`로 해석하는 점진적 마이그레이션 |
| 채팅 | Socket.IO 서버 쓰기, Firestore 저장, 서버를 통한 실시간 송수신·과거 30개·재연결·DM | Firestore `onSnapshot` 기반 상용 MVP로 전환 여부를 비용·지연·권한 테스트 후 결정. 읽기 범위·페이지네이션·중복키·읽음·접속 상태·신고·차단 추가. **두 전송 경로 동시 쓰기 금지** |
| 업무 | 공개 업무 요청·상태 전이·검수·보드·캘린더. `functions/src/taskModel.ts`, `taskResponses.ts`, `apps/web/src/features/tasks/` | 메시지 **한 개**에서 제목만 규칙 기반 생성, 필요할 때만 경량 AI 보조. 현재 `suggestTask`의 최대 8개 대화 문맥·메타데이터 추론을 제거. 마감·업무량 충돌 표시와 근무일 1~3일 검수 기본 정책 재검토 |
| 일정 | 업무 기간·검수 기한·팀 회의. `meetingModel.ts`, `apps/web/src/features/calendar/` | 모임용 제안·투표·확정·반복 일정, 개인 통합 캘린더, 공간 간 busy/free만 공유. 기존 회의와 새 모임 일정의 데이터 의미를 분리 |
| 모임 | 없음 | 수동 일정 제안, 참석자·시간·장소 확인, 출발지 비공개, 중간 지역 3곳 추천, 전원 찬성 확정·버전 재투표·반복 회차 |
| 외부 참여 | 워크스페이스 이메일 초대만 존재 | 특정 투표 범위의 만료·철회 가능한 링크와 비회원 응답자 확인. 채팅·멤버·다른 일정 접근 차단 |
| 알림·파일 | 검수 인앱 알림, 별도 파일 분석 없음 | FCM 및 설정, 업로드 권한·크기·형식·삭제. PDF/DOCX/XLSX/CSV/TXT/이미지에서 업무·회의 후보 추출 후 **사용자 확인을 거쳐서만** 생성 |
| 비용·보안 | Firestore Rules·일부 Emulator 검증, 예산 알림, Cloud Run 최대 1개 | App Check, 서버 멤버십 검증, 사용자·공간·전역 할당량 원자 예약, 긴급 차단, 업로드 격리, 운영 지표·경합·오남용 테스트. 예산 알림은 청구 상한이 아님 |

## 코드에서 먼저 손댈 위치

| 작업 | 현재 수정 대상 | 추가할 모듈·데이터 |
|---|---|---|
| 공간 유형·화면 | `apps/web/src/features/workspace/WorkspaceGate.tsx`, `workspaceApi.ts`, `apps/web/src/types/domain.ts`, `WorkspaceLayout.tsx` | 유형별 홈/탐색, `workspaces.type`, 유형별 정책 |
| 채팅 경로 | `apps/socket-server/src/app.ts`, `firebase.ts`, `apps/web/src/features/chat/LiveChatPanel.tsx`, `messageHistory.ts` | 전송 게이트·읽음·presence·신고/차단; 경로 이전 시 단일 쓰기와 기존 룸 데이터 호환 |
| 업무 제목 | `functions/src/index.ts`, `taskSuggestions.ts`, `apps/web/src/features/tasks/TaskCreateDialog.tsx` | 선택 메시지 한 건 제목 정규화, AI 게이트·사용량 예약·캐시 |
| 모임·투표 | `functions/src/meetingModel.ts`, `apps/web/src/features/calendar/`, `shared/contracts/src/` | proposal/vote/event/series 계약, Functions 전이·확정, 모임 카드·모달 |
| 보안·색인 | `firestore.rules`, `firestore.indexes.json`, `functions/src/index.ts` | 공간 유형·투표·외부 토큰 Rules, 비용 한도·관리자 감사 로그 |
| 로컬·배포 | `scripts/dev-all.mjs`, `firebase.json`, `deploy/cloud-run.env.yaml` | 운영 이전 시에만 새 Firebase 프로젝트·도메인·OAuth 설정; 기존 리소스 ID 유지 |

새 컬렉션 이름·문서 경로는 38일차 스키마 설계와 Rules 테스트에서 확정한다. 기존 `meetings`를 곧바로 새 `events`로 일괄 교체하지 않는다.

## 구현 원칙과 의존성

1. 기존 업무용 데이터와 사용자는 유지한다. `workspaces`에 유형이 없는 문서는 `work`로 읽고, 백필·롤백·규칙 테스트 후 필수 필드로 전환한다. 새 모임 기능은 `meetup`에서 먼저 연다.
2. 채팅 전송은 현재 Socket.IO 서버가 단일 쓰기 경로다. Firestore 구독·서버 함수 경로로 바꾸려면 지연·비용·보안·재연결 검증과 전환 시점·롤백을 정하고, 동일 메시지의 이중 저장을 막는다.
3. 클라이언트가 제출하는 역할·상태·투표 결과를 신뢰하지 않는다. Functions에서 공간 멤버십·DM 참여·상태 전이·할당량을 검증한다. 투표 확정, 검수 자동 완료, 반복 회차 생성은 버전과 멱등키를 사용한다.
4. AI와 지도 호출은 명시적 사용자 행동에서만 일어나며 입력 크기·비용 예약·실패 시 수동 대체를 제공한다. 문서 분석의 결과는 제안이며 자동 등록하지 않는다.
5. 장소 추천의 출발역·지역은 본인이 입력한다. 다른 참석자에게 원본 위치를 기본 공개하지 않으며, 타 워크스페이스에는 개인 일정 제목 대신 busy/free만 제공한다.
6. Notion의 60+7 세션은 신규 구축 가안이다. 아래 36~79일차는 현 코드 재사용을 고려한 **추가 개발 세션 44개(약 132~176시간, 검증 전 추정)**다. 외부 API 계약·가격·상표·도메인은 출시 전에 별도로 확인한다.

## 단계별 출시 게이트

- **36~48일차:** 브랜드·제품 정책·스키마·보안 기반·업무 정책 차이 수정. 기존 업무 흐름 회귀 테스트.
- **49~61일차:** 모임 제안·투표·반복·장소·통합 캘린더·제한형 외부 링크. 투표 동시성 및 타 공간 접근 차단 테스트.
- **62~71일차:** 푸시·업로드·할당량·운영 차단·보안/비용/반응형 검증 후 **문서 분석 제외 내부 베타**.
- **72~79일차:** 문서 분석과 리뷰 흐름, 보안·비용 검증 후 전체 MVP 공개 여부 결정. 2차·3차 기능(정산·회비·코스·예약·광고 등)은 사용 지표와 계약 확인 후 별도 로드맵으로 연다.

## 리브랜딩과 운영 식별자

코드의 서비스명, 웹 메타데이터, 앱 화면, SVG 로고·파비콘, npm 패키지명, 디자인 파일명을 Talkgo로 바꿨다. GitHub 저장소는 [JinS98/talkgo](https://github.com/JinS98/talkgo)로 변경하고 로컬 `origin`을 연결했다. 로컬 에뮬레이터 데이터 폴더도 내용을 보존하며 `.talkgo-emulator-data`로 옮겼다. 작업 폴더는 `C:\work\aaa\talkgo`에 복사해 새 경로에서 사용할 수 있다. 기존 `C:\work\aaa\taskgo`는 IDE가 사용 중이라 이름 변경이 잠겨 있으며, 새 폴더로 IDE를 다시 연 뒤 중복 사본을 정리해야 한다. 과거 1~35일차 기록은 당시 이름을 유지하고, 포트폴리오에는 이전 명칭을 명시한다. `taskgo-jins98`, `demo-taskgo`, 실제 Hosting URL·Cloud Run 서비스 계정·Firebase Auth 설정값은 이미 존재하는 리소스를 가리키므로 문자열만 바꾸지 않는다. 별도의 프로젝트 이전이 필요하면 데이터·Auth·스토리지·OAuth·도메인·비밀키·백업·롤백을 포함한 이전 작업으로 진행한다.
