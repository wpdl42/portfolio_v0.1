# portfolio_v0.1

Next.js App Router와 TypeScript로 만든 장주민의 인터랙티브 포트폴리오입니다. 중앙 Orb의 6개 위성과 검색을 통해 카테고리별 콘텐츠에 접근합니다.

## 실행 방법

```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:3000`으로 접속합니다.

## 페이지 구성

- `/` Orb, 검색, 6개 카테고리와 콘텐츠 패널
- `/?category=projects&view=partial` 프로젝트 부분 패널
- `/?category=projects&view=expanded` 프로젝트 전체 패널
- `/projects` 프로젝트 전체 패널로 리다이렉트
- `/projects/[id]` 프로젝트 상세 정보와 탭
- `/projects/experiment-01` 등 기존 실험 과제 상세
- `/notes/[id]` 기존 프로젝트 정보를 정리한 글 상세 (작성일 미제공)
- `/?category=skills` 기술 활용 경험, `/?category=journey` 교육·활동 타임라인
- `/?category=about` 우측 소개 패널, `/?category=contact` 흐린 홈 위 연락 타이포그래피
- 이전 `category=learning`은 Journey, `category=experiments`는 Projects의 Experiments 필터로 호환됩니다.
- `/assignments` 수업 과제 목록
- `/progress` 기술 학습 진행 상황

## 주요 구현

- `components/OrbExperience.tsx`: 카테고리와 partial/expanded/closed 상태, URL, 포커스, 패널 드래그. 닫는 동안 기존 카테고리와 레이아웃을 유지하고 퇴장이 끝나면 초기화합니다.
- `components/CategoryContent.tsx`: Projects·Notes 탐색 콘텐츠와 Skills·Journey 정보 콘텐츠를 분리합니다. Skills는 기존 기술 목록을 보존하되 퍼센트를 표시하지 않습니다.
- `components/OrbEditorialPanel.tsx`: Contact의 박스 없는 타이포그래피와 About의 우측 소개 패널. 배경 inert·스크롤 잠금·포커스 순환과 복원을 지원합니다. Contact에서는 Orb의 기본 흐름을 유지하고 포인터 반응만 중단합니다.
- `lib/contact.ts`: 확인된 GitHub·블로그 링크와 아직 미등록인 이메일·이력서 설정. 이메일이 등록되면 복사와 완료/실패 안내가 활성화됩니다.
- 상세 화면 진입 시 sessionStorage에 탐색 URL·필터·정렬·스크롤·프로젝트 위치를 보관하고 복귀할 때 복원합니다.
- `components/OrbSearch.tsx`, `lib/orb-content.ts`: 제목 정확 일치 → 제목 부분 일치 → 태그 → 설명 → 관련 상위 카테고리 순으로 검색합니다. Combobox 키보드 탐색과 한글 조합 입력을 처리합니다.
- 검색창은 낮은 불투명도와 10px backdrop blur의 유리 재질을 사용하며, 미지원 환경에는 밝은 대체 배경을 제공합니다. 결과 목록은 검색창 아래에 절대 배치하여 검색어·결과 개수와 관계없이 입력창 위치와 크기를 유지합니다. 목록만 240ms 동안 8px 이동·등장하고 reduced-motion에서는 이동을 생략합니다. 검색창 위에서도 WebGL 광선 교차·표면 변형·기울기·발광을 공통 포인터 루프로 처리합니다.
- `components/FluidOrb.tsx`, `lib/fluid-orb.ts`: 네이티브 WebGL의 실제 구체 메시와 작은 표면 변형, 변형에 맞춘 법선·광택을 사용합니다. 기존 PNG는 재질의 색감에 재사용합니다. 초기화·컨텍스트 실패 시 정적 이미지로 대체합니다.
- `lib/orb-lighting.ts`: 기존 카테고리 색상을 재사용하며 카테고리 호버·키보드 포커스 → 포인터 근접 반응 → 선택 → 검색 → 기본 순서로 Orb 조명을 결정합니다. 직접 호버와 근접 반응은 동일한 최대 강도·확산·반사·테두리광 기준값을 공유합니다. 색상 혼합과 시간 보간에서 원본 색상의 가중 채도·밝기를 보존하며, 상호 전환의 중복 감쇠로 밝기가 낮아지지 않도록 조명 에너지를 정규화합니다. 실패 시 별도 glow 레이어에도 같은 강도를 사용합니다. 카테고리 진입 250ms·복귀 420ms 보간은 React 렌더링 없이 처리하며 reduced-motion에서도 색상 전환만 유지합니다.
- `lib/orb-surface.ts`: 포인터와 공전 중인 카테고리의 현재 화면상 거리를 부드러운 역거리 가중치로 혼합합니다. 중심에서 1.45반지름까지는 호버 최대 강도를 유지하고, 마지막 1.45~1.7반지름 구간에서만 부드럽게 감쇠합니다. 안팎에서 같은 연속 투영을 사용해 빛을 포인터 방향의 3D 표면에 배치합니다. 카테고리 호버·키보드 포커스 → 포인터 근접 → 선택 → 검색 → 기본 순서로 조명을 적용합니다. 직접 접촉은 변형 표면과의 광선 교차로 계산하며, 기존 약 4.3도 기울기·반지름 2.5% 이동·제한된 국소 변형을 유지합니다. 범위를 벗어나면 780ms 동안 복귀합니다. 검색창의 입력란·아이콘·실행 버튼에서도 추적을 유지합니다. 검색 결과·콘텐츠 패널과 터치는 제외하며 reduced-motion에서는 색상만 변화합니다. 입력과 시간 기반 보간은 React 상태 변경 없이 렌더링 루프에서 처리합니다.
- `hooks/useSatelliteMotion.ts`: 제한된 타원 경로의 카테고리 이동. hover·포커스·선택 중에는 해당 버튼이 멈추며, 모바일과 reduced-motion에서는 안정된 배치를 사용합니다.
- `hooks/useSearchResultSpace.ts`: 실제 항목 높이·목록 여백을 합산해 최소 3개 결과의 표시 공간을 확보하고 나머지는 내부 스크롤로 접근합니다. 위성 위치는 변경하지 않으며, 여유가 있으면 하단 위성까지 20px 간격을 반영합니다. 검색 중 하단 공전은 정지합니다. 창·visualViewport·항목 크기 변경 시 다시 측정하며 매 프레임 React 상태를 변경하지 않습니다.
- `app/orb.css`: 약 680ms의 연결 전환과 임계 감쇠 spring 곡선. 별도 애니메이션 라이브러리는 사용하지 않습니다.
- `public/images/project-*.svg`: 실제 실행 화면과 구분하도록 표시한 프로젝트별 일러스트입니다.

WebGL과 공전은 화면 밖, 확장 패널 뒤, 백그라운드 탭에서 중지됩니다. 작은 화면에서는 픽셀 비율과 메시 해상도도 제한합니다.

## MongoDB 프로젝트 등록

서버 전용 `.env.local`의 `MONGODB_URI`를 사용합니다. `MONGODB_DB` 기본값은 `portfolio`, 컬렉션은 `projects`입니다.

```bash
npm run seed:reown
```

표시명 **거래소**의 데이터를 slug·배포 주소로 upsert하며 기존 ID·표시 순서를 유지합니다. 공개 DB 문서는 서버에서 읽어 카드·검색·상세에 반영합니다. DB 장애 시 로컬 카탈로그를 사용합니다. 상세 근거와 재실행 방법은 [등록 문서](docs/reown-project.md)를 참고하세요. 거래소 UI 검증은 `node scripts/verify-orb.mjs --stage=16 --only`입니다.

## 코드 검사

```bash
npm run lint
npx tsc --noEmit --incremental false
npm run build
```

로컬 서버가 실행 중일 때 실제 Chrome으로 UI 회귀 검증을 실행합니다. 기본 브라우저 경로는 Windows의 설치된 Chrome이며 `CHROME_PATH`로 변경할 수 있습니다.

```bash
npm run test:ui
```

다른 포트의 서버는 `PORTFOLIO_TEST_URL`로 지정합니다. `PORTFOLIO_CAPTURE_DIR`를 지정하면 화면 캡처도 저장합니다. 기본 stage 15는 현재 6개 카테고리의 통합 검증입니다. 이전 단계의 검증은 `--stage=12 --only` 등의 옵션으로 실행할 수 있으며, 이전 카테고리 구성에 의존하는 단계도 포함되어 있습니다.

검증 항목은 닫기와 포커스 복원, 빠른 재선택·뒤로가기, 검색 순위와 IME, 키보드 탐색, 실제 WebGL 메시와 실패 대체, 패널 드래그, 카드 관성·상세 이동, 1440/1024/768/390px 배치, 모바일 내부 스크롤과 터치, 백그라운드 정지입니다. 화면 크기와 터치는 Chrome에서 에뮬레이션하며 실기기 Safari 검증은 별도입니다.
