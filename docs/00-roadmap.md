# Talkgo — 1~79일차 로드맵

1일차 = 약 3~4시간 개발 세션. 1~35일차는 기존 Taskgo 업무용 구현·검증 기록(당시 예상 105~140시간)이다. 36~79일차는 [Talkgo 확장 기획과 코드 차이](11-talkgo-expansion.md)를 반영한 추가 44세션(약 132~176시간, 검증 전 추정)이다. 체크리스트는 각 `daily/day-XX.md` 참조.

| 일차 | 주제 | 완료 기준 |
|---|---|---|
| [01일차](daily/day-01.md) | 프로젝트 초기 설정 | 로컬 빌드 |
| [02일차](daily/day-02.md) | 설계·폴더 구조 | 설계 문서 |
| [03일차](daily/day-03.md) | 레이아웃 | 레이아웃 화면 |
| [04일차](daily/day-04.md) | 사이드바 | 사이드바 |
| [05일차](daily/day-05.md) | 상태 관리 | 뷰 전환 |
| [06일차](daily/day-06.md) | Firebase 준비·로그인 방식 설정 | 개발 환경 |
| [07일차](daily/day-07.md) | 이메일·비밀번호/Google 인증 | 두 방식의 로그인 플로우 |
| [08일차](daily/day-08.md) | 워크스페이스 장·초대·멤버십/데이터 권한 | 이메일 초대 링크 가입·스키마 초안 |
| [09일차](daily/day-09.md) | 채팅 UI | 채팅 목업 |
| [10일차](daily/day-10.md) | Socket.io 서버 | 로컬 소켓 연결 |
| [11일차](daily/day-11.md) | 소켓 인증 | 권한 검증 |
| [12일차](daily/day-12.md) | 메시지 영속화 | 메시지 저장 |
| [13일차](daily/day-13.md) | 실시간 수신 | 2브라우저 채팅 |
| [14일차](daily/day-14.md) | 과거 내역 | 이전 대화 |
| [15일차](daily/day-15.md) | 연결 복구 | 오프라인 복구 |
| [16일차](daily/day-16.md) | 상태 UX | 실시간 UX |
| [17일차](daily/day-17.md) | 업무 데이터 모델 | 업무 스키마 |
| [18일차](daily/day-18.md) | 업무 생성 모달 | 수동 업무 요청 |
| [19일차](daily/day-19.md) | AI 업무 추출 | AI 제안 |
| [20일차](daily/day-20.md) | 업무 수락·거절 | 요청 플로우 |
| [21일차](daily/day-21.md) | 진행·마감 협의 | 상태 전이 |
| [22일차](daily/day-22.md) | 검수 선택 | 검수 요청 |
| [23일차](daily/day-23.md) | 승인·재작업 | 검수 루프 |
| [24일차](daily/day-24.md) | 근무시간 계산 | 기한 계산 |
| [25일차](daily/day-25.md) | 자동 완료 | 자동 DONE |
| [26일차](daily/day-26.md) | 알림 | 알림 센터 |
| [27일차](daily/day-27.md) | 업무 보드 | 보드 |
| [28일차](daily/day-28.md) | 캘린더 기본 | 팀 캘린더 |
| [29일차](daily/day-29.md) | 캘린더 필터 | 3개 필터 |
| [30일차](daily/day-30.md) | 캘린더 협의 | 일정 협의 |
| [31일차](daily/day-31.md) | 양방향 이동 | 연결 UX |
| [32일차](daily/day-32.md) | 초대·멤버십 포함 보안·통합 테스트 | 검증 체크리스트 |
| [33일차](daily/day-33.md) | UX·성능 | 품질 개선 |
| [34일차](daily/day-34.md) | 무료 운영 배포 | 검증용 URL |
| [35일차](daily/day-35.md) | 최종 검증·문서 | 포트폴리오 완성 |
| [36일차](daily/day-36.md) | Talkgo 브랜드·기준선 | [계획·완료 기준](daily/day-36.md) |
| [37일차](daily/day-37.md) | 업무/모임 정책 확정 | [계획·완료 기준](daily/day-37.md) |
| [38일차](daily/day-38.md) | 스키마·이전 설계 | [계획·완료 기준](daily/day-38.md) |
| [39일차](daily/day-39.md) | 환경·운영 경계 | [계획·완료 기준](daily/day-39.md) |
| [40일차](daily/day-40.md) | App Check·Rules 기반 | [계획·완료 기준](daily/day-40.md) |
| [41일차](daily/day-41.md) | 유형별 워크스페이스 | [계획·완료 기준](daily/day-41.md) |
| [42일차](daily/day-42.md) | 유형별 홈·탐색 | [계획·완료 기준](daily/day-42.md) |
| [43일차](daily/day-43.md) | 채팅 전송 구조 검증 | [계획·완료 기준](daily/day-43.md) |
| [44일차](daily/day-44.md) | 채팅 권한·한도 | [계획·완료 기준](daily/day-44.md) |
| [45일차](daily/day-45.md) | 실시간 내역·재연결 | [계획·완료 기준](daily/day-45.md) |
| [46일차](daily/day-46.md) | 읽음·접속·신고 | [계획·완료 기준](daily/day-46.md) |
| [47일차](daily/day-47.md) | 업무 제목 제안 수정 | [계획·완료 기준](daily/day-47.md) |
| [48일차](daily/day-48.md) | 업무량·충돌 표시 | [계획·완료 기준](daily/day-48.md) |
| [49일차](daily/day-49.md) | 모임 일정 모델 | [계획·완료 기준](daily/day-49.md) |
| [50일차](daily/day-50.md) | 수동 제안 모달 | [계획·완료 기준](daily/day-50.md) |
| [51일차](daily/day-51.md) | 투표 카드·전원 찬성 | [계획·완료 기준](daily/day-51.md) |
| [52일차](daily/day-52.md) | 재투표·마감·취소 | [계획·완료 기준](daily/day-52.md) |
| [53일차](daily/day-53.md) | 반복 규칙 | [계획·완료 기준](daily/day-53.md) |
| [54일차](daily/day-54.md) | 반복 회차 생성 | [계획·완료 기준](daily/day-54.md) |
| [55일차](daily/day-55.md) | 회차별 참석 확인 | [계획·완료 기준](daily/day-55.md) |
| [56일차](daily/day-56.md) | 출발지·위치 공개 | [계획·완료 기준](daily/day-56.md) |
| [57일차](daily/day-57.md) | 지도·교통 API 검증 | [계획·완료 기준](daily/day-57.md) |
| [58일차](daily/day-58.md) | 중간 장소 추천 | [계획·완료 기준](daily/day-58.md) |
| [59일차](daily/day-59.md) | 개인 통합 캘린더 | [계획·완료 기준](daily/day-59.md) |
| [60일차](daily/day-60.md) | 외부 투표 링크 | [계획·완료 기준](daily/day-60.md) |
| [61일차](daily/day-61.md) | 비회원 응답 검증 | [계획·완료 기준](daily/day-61.md) |
| [62일차](daily/day-62.md) | 푸시·알림 설정 | [계획·완료 기준](daily/day-62.md) |
| [63일차](daily/day-63.md) | 첨부파일 경계 | [계획·완료 기준](daily/day-63.md) |
| [64일차](daily/day-64.md) | 호출·비용 할당량 | [계획·완료 기준](daily/day-64.md) |
| [65일차](daily/day-65.md) | 운영 차단·감사 | [계획·완료 기준](daily/day-65.md) |
| [66일차](daily/day-66.md) | 예산·백업·개인정보 | [계획·완료 기준](daily/day-66.md) |
| [67일차](daily/day-67.md) | Rules 격리 검증 | [계획·완료 기준](daily/day-67.md) |
| [68일차](daily/day-68.md) | 경합·멱등 검증 | [계획·완료 기준](daily/day-68.md) |
| [69일차](daily/day-69.md) | 비정상 호출·비용 훈련 | [계획·완료 기준](daily/day-69.md) |
| [70일차](daily/day-70.md) | 반응형·접근성·PWA | [계획·완료 기준](daily/day-70.md) |
| [71일차](daily/day-71.md) | 소규모 내부 베타 | [계획·완료 기준](daily/day-71.md) |
| [72일차](daily/day-72.md) | 문서 업로드·검증 | [계획·완료 기준](daily/day-72.md) |
| [73일차](daily/day-73.md) | 텍스트 문서 추출 | [계획·완료 기준](daily/day-73.md) |
| [74일차](daily/day-74.md) | 표 문서 파싱 | [계획·완료 기준](daily/day-74.md) |
| [75일차](daily/day-75.md) | 이미지·손글씨 분석 | [계획·완료 기준](daily/day-75.md) |
| [76일차](daily/day-76.md) | 구조화 후보·멤버 매칭 | [계획·완료 기준](daily/day-76.md) |
| [77일차](daily/day-77.md) | 후보 검토·생성 모달 | [계획·완료 기준](daily/day-77.md) |
| [78일차](daily/day-78.md) | 문서 보안·비용 검증 | [계획·완료 기준](daily/day-78.md) |
| [79일차](daily/day-79.md) | 전체 MVP 출시 판정 | [계획·완료 기준](daily/day-79.md) |
