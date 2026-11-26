# Talkgo 데이터 스키마·무손실 이전 설계

38일차 설계 기준 (2026-11-26). [37일차 권한 정책](daily/day-37.md)과 [Talkgo 기획서](https://app.notion.com/p/Talkgo-422c883fa202817881fadbd1c2eea1db)를 따른다. 이 문서는 **목표 계약과 배포 순서**이며 새 컬렉션, 색인, Rules, 백필은 아직 운영 환경에 적용하지 않았다.

## 현재 데이터와 호환성

| 현재 경로 | 현재 필드·용도 | 이전 원칙 |
| --- | --- | --- |
| `workspaces/{workspaceId}` | `name`, `ownerId`, `createdAt`; 유형 없음 | 유형 **누락만** `work`로 해석. 명시적 `work`/`meetup` 이외 값은 오류로 처리 |
| `workspaces/{workspaceId}/members/{uid}` | `uid`, `email`, `role`, `joinedAt`, 선택적 프로필 | 현재 멤버십의 권한 원본. 기존 문서와 역할을 재작성하지 않음 |
| `users/{uid}/workspaces/{workspaceId}` | 이름·역할을 표시하는 사용자별 목록 | 탐색용 복사본. 유형·권한의 원본으로 사용하지 않음 |
| `workspaceInvites/{inviteId}` | 이메일·토큰 해시·상태·만료 | 기존 초대 경로와 수락 흐름 유지. 수락 시 대상 공간 유형은 서버가 원본에서 읽음 |
| `tasks/{taskId}`, `taskEvents/{eventId}` | 업무 요청·상태·검수 이력 | 기존 ID·참조·타임스탬프 유지. `work` 공간에만 신규 생성 허용 |
| `meetings/{meetingId}` | 기존 업무용 팀 회의 | **업무용 회의로 유지**. 새 모임 이벤트로 일괄 변환하지 않음 |
| `channels`, `dmRooms`, `messages` | 공간 내 대화와 원본 메시지 | 기존 ID와 읽기 권한 유지. 모임 제안의 원본 링크도 참여자에게만 열림 |

읽기 규칙은 `type`이 **없는** 문서에만 `work` 기본값을 준다. `null`, 빈 문자열, 오타, 알 수 없는 미래 유형을 `work`로 조용히 바꾸지 않는다. 새 `meetup` 문서에는 처음부터 명시적 유형을 저장한다. 기존 문서에 `type`을 덧붙여도 이름·소유자·멤버·업무·회의·초대·메시지 데이터는 그대로 둔다.

## 목표 문서 계약

`Timestamp`는 Firestore 타임스탬프다. 날짜와 반복 규칙에는 `timeZone`을 IANA 이름(`Asia/Seoul` 기본)으로 저장한다. 사용자 입력 문자열의 길이·ID·시각 순서·멤버십은 서버에서 재검증한다. 클라이언트가 보내는 `status`, `version`, 집계값, 소유자 역할은 신뢰하지 않는다.

| 경로 | 필수 필드와 제약 | 권한·불변식 |
| --- | --- | --- |
| `workspaces/{id}` | 기존 필드 + 새 문서는 `type: 'work' | 'meetup'` | 생성 이후 유형 변경 금지. 누락은 레거시 `work`로 읽음 |
| `meetupProposals/{id}` | `workspaceId`, `createdById`, `eligibleMemberIds`, `title`, `startsAt?`, `endsAt?`, `timeZone`, `location?`, `description?`, `responseDeadlineAt`, `status`, `version`, `voteCounts`, `createdAt`, `updatedAt`, 선택적 `sourceMessageId` | `meetup` 공간만. 제안자는 참석 대상에 포함. 미정 시각·장소는 `null`이며, 확정 전 필수값 검증. 제안자와 참석 대상만 상세 조회. `version >= 1` |
| `meetupProposals/{id}/votes/{version}_{uid}` | `proposalVersion`, `voterId`, `choice: 'YES' | 'CHANGE_REQUEST' | 'DECLINE'`, `respondedAt`, 선택적 사유 | 한 버전·한 사람에 문서 하나. 미응답은 문서 없음. 이전 버전 투표는 보존하되 현재 집계에서 제외. 직접 쓰기 금지 |
| `meetupEvents/{id}` | `workspaceId`, `proposalId`, `proposalVersion`, `participantIds`, `title`, `startsAt`, `endsAt`, `timeZone`, `location?`, `status`, `createdAt`, `updatedAt`, 선택적 `seriesId`, `occurrenceNumber` | 참석 대상만 상세 조회. 단건 이벤트 ID는 `p_{proposalId}`로 고정해 중복 확정 방지. 확정 제안과 동일 공간·버전 |
| `meetupSeries/{id}` | `workspaceId`, `proposalId`, `participantIds`, `recurrence`, `timeZone`, `until` 또는 `count`, `generatedThrough`, `revision`, `status`, `createdAt`, `updatedAt` | 첫 규칙 승인 후 생성. 회차는 제한된 기간만 만들고 `s_{seriesId}_{occurrenceNumber}`로 멱등 생성. 변경은 전체/이번/이후 회차를 구분 |

`meetupProposals.status`는 `OPEN`, `CONFIRMED`, `EXPIRED`, `CANCELLED`로 시작한다. 응답 기한 경과는 `EXPIRED`이며 자동 확정하지 않는다. 날짜·시간·장소·대상 변경은 트랜잭션에서 `version` 증가, 현재 투표 집계 초기화, 생성자 찬성 기록을 함께 처리한다. 전원 찬성 여부와 이벤트 생성은 같은 트랜잭션에서 확인한다. 확정 이후 변경은 기존 이벤트를 덮어쓰기보다 별도 변경 제안·이력을 사용한다.

`voteCounts`는 서버가 투표 문서와 함께 갱신하는 파생값이다. 각 응답은 현재 `eligibleMemberIds`, `version`, `status`, 기한을 확인한 뒤 반영한다. 동시 응답은 트랜잭션 재시도로 직렬화하며 이벤트 ID는 결정적으로 만든다. 외부 투표 링크와 원본 출발 위치는 이 문서에 섞지 않고 별도 제한 경로로 설계한다.

## 조회·색인 설계

색인은 해당 쿼리·Rules가 구현되고 에뮬레이터에서 검증될 때 `firestore.indexes.json`에 추가한다. 38일차에는 미사용 색인을 운영에 배포하지 않는다.

| 화면·서버 조회 | 계획 쿼리 | 필요한 색인/범위 |
| --- | --- | --- |
| 내 모임 제안·미응답 | `meetupProposals`의 `workspaceId == id`, `eligibleMemberIds array-contains uid`, `updatedAt desc` | 복합: `workspaceId ASC`, `eligibleMemberIds CONTAINS`, `updatedAt DESC`; 서버·Rules가 현재 멤버십과 대상 여부 확인 |
| 응답 기한 종료 작업 | `meetupProposals`의 `status == OPEN`, `responseDeadlineAt <= now`, 정해진 크기로 조회 | 복합: `status ASC`, `responseDeadlineAt ASC`. 만료 전이는 서버 트랜잭션에서 상태·버전 재확인, 자동 확정 없음 |
| 내 확정 모임 일정 | `meetupEvents`의 `workspaceId == id`, `participantIds array-contains uid`, 일정 범위 | 복합: `workspaceId ASC`, `participantIds CONTAINS`, `endsAt ASC`, `startsAt ASC` 후보. 시작 전·종료 후 겹침 이벤트를 실제 쿼리로 검증한 뒤 순서 확정 |
| 제안의 내 투표 | `meetupProposals/{id}/votes/{version}_{uid}` 직접 조회 | 복합 색인 없음. 원시 투표 목록은 클라이언트에 열지 않고 서버가 집계 반환 |
| 반복 회차 생성 | `meetupSeries/{id}` 직접 조회 후 지정 범위의 결정적 회차 ID 쓰기 | 복합 색인 없음. `generatedThrough`와 버전 전제 조건을 트랜잭션으로 검증 |
| 기존 업무·회의 캘린더 | 현재 `tasks`·`meetings`의 `workspaceId` 조회 | 기존 쿼리·Rules 유지. 기간 제한 개선은 별도 회귀 검증 후 적용 |

Firestore Rules는 쿼리 필터가 아니다. 참석 대상 전용 목록은 `array-contains uid`를 쿼리에 포함해야 하며, Rules에서도 **현재 멤버십 + 문서의 참석 대상**을 확인한다. `meetupProposals`, `meetupEvents`, `meetupSeries`, 투표는 초기에는 기본 거부이고, 서버 검증과 Rules 테스트 전까지 쓰기·읽기를 열지 않는다. 기존 `tasks`/`meetings` 읽기 규칙은 새 모임 데이터에 재사용하지 않는다.

## 이전 순서와 검증 게이트

1. **기준선 보존:** 운영 Firestore의 복원 가능한 백업 또는 관리형 내보내기를 확인한다. 관리형 내보내기는 실행 시작 시점의 일관된 스냅샷이 아니므로, 정확한 기준선이 필요하면 쓰기를 멈춘 점검 구간을 두거나 일관된 백업을 사용한다. 공간 ID·유형 필드 분포, 멤버/사용자별 목록, 업무·회의의 `workspaceId` 참조 수를 읽기 전용으로 집계한다. 보존 위치·시각·문서 수·작업 버전·복원 테스트 결과와 예상 읽기/보관 비용을 기록한다.
2. **호환 읽기 먼저 배포:** 웹과 Functions가 `type` 누락을 `work`로 해석하고, 명시적 미지원 유형은 오류 화면/서버 오류로 처리한다. `createTask`, `suggestTask`, `createMeeting` 등 업무용 생성 경로는 유효 유형이 `work`인지 서버에서 확인한다. 레거시 업무 화면·업무 생성·회의 생성이 그대로 동작하는지 테스트한다. 이 단계에서는 `meetup` 생성을 노출하지 않는다.
3. **Rules의 양쪽 형태 허용:** 기존 3필드 `workspaces` 생성과 명시적 `work` 생성이 겹치는 기간을 둔다. 새 `meetup` 생성은 유형별 권한 Rules·서버 경로가 완성될 때까지 거부한다. `ownerId`·멤버 역할·유형의 클라이언트 변경은 계속 거부한다.
4. **신규 업무용 쓰기 전환:** 새 클라이언트가 `type: 'work'`를 저장하게 한다. 기존 클라이언트의 레거시 쓰기와 새 쓰기를 함께 검증한다. 사용자별 공간 목록에 유형을 권한 원본으로 복제하지 않는다.
5. **선택적 백필:** 유형이 누락된 공간에만 `type: 'work'`를 추가한다. 각 문서의 읽은 `updateTime`을 전제 조건으로 사용해 동시 변경을 덮지 않는다. 작업은 작은 묶음·재시도 가능·중단 재개 가능하게 만들고, 실패 ID와 이유를 남긴다. 이미 `work`인 문서는 건너뛰고, `meetup`이나 명시적 이상값은 자동 수정하지 않는다.
6. **무손실 대조:** 백필 전후 공간·멤버·업무·회의·초대·메시지 수와 문서 ID가 같고, 공간에는 `type` 외 필드 변화가 없는지 확인한다. 각 업무·회의가 `work` 공간을 가리키고 기존 소유자·멤버 권한 및 채널/DM 접근이 유지되는지 에뮬레이터와 제한된 운영 읽기로 확인한다.
7. **모임 쓰기 개방:** 40일차 권한 기반, 41일차 유형 생성 화면 및 서버 검증 후 별도로 활성화한다. 49일차 이후 제안·투표·이벤트 경로를 단계적으로 열고 실제 쿼리 색인을 추가한다. 모든 클라이언트 전환과 운영 확인 전에는 레거시 읽기 규칙을 제거하지 않는다.

백필은 38일차에 실행하지 않는다. 운영 데이터에 쓰기 전에 내보내기·드라이런·권한 테스트·중단 절차를 갖춘 배치 구현과 배포 시점을 별도로 정한다.

## 롤백과 오류 처리

- 새 유형 화면 또는 Rules에 문제가 생기면 `meetup` 생성·제안·투표 쓰기를 먼저 중단하고, **레거시 누락 + 명시적 `work`를 읽는** 이전 안정 버전으로 웹·Functions·Rules를 되돌린다. `type` 필드나 새 문서를 일괄 삭제하지 않는다.
- 백필 오류는 실패 문서만 중단·재시도한다. `updateTime` 충돌이면 새 상태를 다시 읽고 재분류한다. 알 수 없는 유형·깨진 참조는 격리 목록에 남겨 수동 확인한다. 자동으로 `work`로 교정하지 않는다.
- 복원이 정말 필요하면 기준선 내보내기와 현재 변경분을 먼저 비교하고, 영향 범위를 제한한 복원 계획을 세운다. 전체 데이터베이스 덮어쓰기는 백필 롤백의 기본 수단이 아니다.
- UI는 유형 누락 시 기존 업무 화면을, 명시적 미지원 유형·조회 실패 시 안내와 재시도를 보여 준다. 실패한 생성/투표 요청은 서버 결과 확인 없이 자동 재전송하지 않는다. 구버전 웹이 `meetup` 공간을 업무 공간으로 렌더링하지 못하게 유형 게이트를 배포한 뒤 모임 생성을 연다.

## 38일차 검증 범위

현 코드에는 새 유형·제안·투표·시리즈 경로가 없으므로 이 문서의 새 경로 보안을 **검증 완료로 표시하지 않는다**. 현재 서버의 업무 생성/상태 전이/회의 생성, Firestore 멤버십·DM·업무·회의 읽기, 기존 화면 탐색 회귀 검증은 [38일차 기록](daily/day-38.md)에 남긴다. 색인 순서·Rules 문법·동시 투표·실제 백필 검증은 해당 구현 일차의 출시 게이트다.

Firestore의 [쿼리와 Rules 관계](https://firebase.google.com/docs/firestore/security/rules-query), [복합 범위 쿼리와 색인](https://firebase.google.com/docs/firestore/query-data/multiple-range-fields), [관리형 내보내기·가져오기](https://docs.cloud.google.com/firestore/native/docs/manage-data/export-import), [일관된 백업](https://docs.cloud.google.com/firestore/native/docs/backups)을 기준으로 실행 전 쿼리·비용·복원 절차를 다시 확인한다.
