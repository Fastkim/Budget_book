# 차곡 · 나의 일상을 담는 가계부

매일의 지출과 월급·기타 수입을 기록하고, 월별·연별 흐름을 확인하는 한국어 가계부입니다. 서버와 외부 패키지 없이 실행되는 HTML/CSS/JavaScript 앱으로, GitHub Pages의 저장소 하위 경로에서도 사용할 수 있습니다.

## 할 수 있는 일

- 지출·수입 추가, 수정, 삭제
- 날짜, 분류, 금액, 결제 수단, 메모 기록
- 일별 지출, 월별·연별 수입/지출/잔액 통계와 분류별 분석
- 내역 검색 및 필터
- JSON 백업 내보내기·가져오기와 CSV 내보내기
- 데스크톱·모바일 화면 지원

첫 화면의 **예시 데이터**는 기능을 둘러보기 위한 자료입니다. 개인 기록과 섞이거나 백업에 포함되지 않으며, 첫 기록을 저장하면 나의 가계부가 시작됩니다.

## 로컬에서 실행

Node.js 20 이상이 필요합니다. 설치할 패키지는 없습니다.

```sh
npm run dev
```

브라우저에서 <http://127.0.0.1:4173>을 여세요. HTML 파일을 직접 여는 대신 개발 서버를 사용하세요. 종료는 `Ctrl+C`입니다.

```sh
npm test
npm run build
npm run preview
```

`npm test`는 날짜·금액 검증, 월별·연별 집계, 백업 가져오기 등을 검사합니다. `npm run build`는 필요한 정적 파일만 `dist/`로 복사하고, `npm run preview`는 빌드 결과를 제공합니다. 기본 포트가 사용 중이면 `PORT` 환경변수로 다른 포트를 지정하세요.

## GitHub Pages에 배포

1. GitHub에서 저장소를 만들고 이 프로젝트를 `main` 또는 `master` 브랜치에 업로드합니다. 무료 개인 계정이라면 공개 저장소를 사용할 수 있습니다.
2. 저장소의 **Settings → Pages → Build and deployment → Source**에서 **GitHub Actions**를 선택합니다.
3. **Actions → Deploy Chagok to GitHub Pages → Run workflow**를 실행합니다. 이후 `main`/`master`에 변경사항을 올리면 테스트와 배포가 자동 실행됩니다.
4. 실행이 성공하면 **Settings → Pages** 또는 배포 작업의 `github-pages` 환경에서 사이트 주소를 확인합니다.

보통 `https://사용자이름.github.io/저장소이름/` 주소로 제공됩니다. 이 프로젝트에 포함된 워크플로는 `dist/`만 배포합니다. 별도의 API 키나 개인 액세스 토큰은 필요하지 않습니다. 기본 브랜치가 `main`/`master`가 아니라면 `.github/workflows/pages.yml`의 `branches`를 수정하세요.

배포 방식과 제공 범위는 [GitHub Pages 공식 문서](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)를 참고하세요. 이 프로젝트의 저장소는 [Fastkim/Budget_book](https://github.com/Fastkim/Budget_book)이며, 배포 실행 결과는 저장소의 Actions에서 확인할 수 있습니다.

## 기록이 저장되는 곳

입력한 기록은 **현재 기기·브라우저의 localStorage**에 저장됩니다. 기록을 GitHub 저장소나 서버에 전송하지 않으므로, 공개된 페이지의 다른 방문자가 같은 기록을 보지는 않습니다.

브라우저·기기·사이트 주소가 다르면 기록도 다릅니다. 예를 들어 로컬 미리보기의 기록이 GitHub Pages로 자동으로 옮겨지지 않습니다. 브라우저 데이터 삭제, 시크릿 모드 종료, 기기 교체 시 기록이 사라질 수 있으니 **데이터 관리에서 JSON 백업**을 주기적으로 내려받으세요. 다른 기기나 주소로 옮길 때에도 JSON 백업을 가져오면 됩니다. CSV는 표 계산 프로그램에서 확인하기 위한 내보내기 형식입니다.

로그인·클라우드 동기화·여러 기기 간 공유는 포함하지 않습니다. 이를 추가하려면 별도의 인증 및 데이터 저장 서비스가 필요합니다. 백업 파일에도 소비·수입 기록이 들어 있으므로 개인 파일로 보관하세요.

## 구성

```text
index.html                 페이지 진입점
src/                       화면, 스타일, 가계부 계산
scripts/serve.mjs          로컬 정적 서버
scripts/build.mjs          GitHub Pages용 정적 빌드
tests/                     계산·검증 테스트
.github/workflows/pages.yml 자동 테스트·배포
```
