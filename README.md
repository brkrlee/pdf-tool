# 도치 PDF 도구 모음

브라우저에서 바로 동작하는 PDF 병합 / 분할 / 압축 / JPG 변환 도구입니다. 서버가 없는 순수 클라이언트 사이드 웹앱이라 파일이 외부로 전송되지 않습니다.

**Live**: https://brkrlee.github.io/pdf-tool/

## 기능

- **병합**: 여러 PDF 파일을 원하는 순서로 정렬해서 하나로 합칩니다.
- **분할**
  - 모든 페이지를 개별 PDF로 분할 (zip으로 다운로드)
  - 페이지 범위를 지정해 구간별로 분할 — 쉼표로 구분한 각 구간이 별도 파일로 출력됩니다 (예: `1-3,4-6` → 2개 파일). `+`로 여러 범위를 묶어 한 파일에 담을 수도 있습니다 (예: `1-2,6-8+10`).
- **압축**: 각 페이지를 JPEG로 다시 렌더링해 재조립합니다. 화질/해상도를 슬라이더로 조절할 수 있으며, 스캔본·이미지 위주 PDF에서 효과적입니다.
- **JPG 변환**: 각 페이지를 JPG로 변환합니다. 여러 페이지는 zip으로 묶어 다운로드합니다.

## 기술 스택

- [pdf-lib](https://github.com/Hopding/pdf-lib) — PDF 생성/병합/페이지 추출
- [pdf.js](https://github.com/mozilla/pdf.js) — PDF 페이지 렌더링
- [JSZip](https://github.com/Stuk/jszip) — 다중 파일 zip 압축
- 빌드 도구 없는 순수 HTML/CSS/JS, 라이브러리는 CDN에서 로드

## 로컬 실행

별도 빌드 과정 없이 정적 파일을 서빙하기만 하면 됩니다.

```bash
npx serve .
```

또는 `index.html`을 브라우저로 직접 열어도 동작합니다.

## 배포

GitHub Pages로 배포되어 있습니다 (Settings → Pages → Deploy from a branch → `main` / root).
