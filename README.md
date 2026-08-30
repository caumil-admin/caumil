# CAUMIL Competition Intelligence

과거 우승 사례 `P003`·`P027`과 현재 연구계획서를 결합해 상대 우승 가능성과 민감도 기반 개선 우선순위를 보여 주는 분석 페이지입니다.

## 구성

- 순수 HTML, CSS, JavaScript
- 외부 런타임·패키지 의존성 없음
- GitHub Actions를 통한 GitHub Pages 배포
- 반응형 레이아웃 및 키보드 접근성 지원
- 7조·최석철의 입력 민감도와 실행 가능한 실험·시연 개선 체크리스트

## 로컬 확인

저장소 루트에서 정적 파일 서버를 실행한 뒤 브라우저로 접속합니다.

```bash
python -m http.server 4173
```

배포 주소: <https://caumil-admin.github.io/caumil.io/>

## 주의

페이지에 표시된 확률은 통계적으로 보정된 실제 적중확률이 아니라 현재 후보군 내 상대 우위 지표입니다. 과거 대회가 팀·개인 각 1회뿐이므로 의사결정 참고용으로 사용해야 합니다.
