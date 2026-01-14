# Scripts

Product Backlog 관리를 위한 유틸리티 스크립트 모음입니다.

## 요구사항

- [GitHub CLI (`gh`)](https://cli.github.com/) - GitHub API 접근
- [`jq`](https://jqlang.github.io/jq/) - JSON 처리

```bash
# macOS
brew install gh jq

# gh 인증
gh auth login
```

## 스크립트 목록

### sprint-in-progress.sh

Sprint Backlog 프로젝트에서 "In Progress" 상태인 이슈 목록을 Markdown 테이블로 출력합니다.

#### 사용법

```bash
./scripts/sprint-in-progress.sh
```

#### 출력 예시

```markdown
| # | 구분 | 이슈 | FE | BE | Desc |
|---|------|------|:--:|:--:|------|
| 1 |  | [Sprint ~260123](https://github.com/qb-group/better-wealth-fa/issues/659) | - | - | be: 34d, fe: 17d |
| 2 |  | [Release: FA+App](https://github.com/qb-group/better-wealth-fa/issues/627) | 1.0 | 2.0 | market: 1d |
| 3 | 스프린트 연속 | [KB자문: IRP: 계약](https://github.com/qb-group/better-wealth-kb-pb/issues/69) | - | - | - |
| 4 | 신규 | [App) 종합소득세조회](https://github.com/qb-group/better-wealth-pb/issues/981) | 0.0 | 3.0 | - |
| 5 | 기술 부채 | [마이데이터: 계좌별 상태 관리](https://github.com/qb-group/better-wealth-pb/issues/1041) | - | 3.0 | - |
```

#### 출력 컬럼 설명

| 컬럼 | 설명 |
|------|------|
| # | 순번 |
| 구분 | 이슈 분류 (스프린트 연속, 신규, 기술 부채) |
| 이슈 | 이슈 제목 (GitHub 링크 포함) |
| FE | Frontend 예상 공수 (일 단위) |
| BE | Backend 예상 공수 (일 단위) |
| Desc | 추가 설명 |

#### 구분 기준

Sprint Backlog 프로젝트의 구분자(DraftIssue)를 기준으로 분류됩니다:

- **(빈 값)**: 구분자 이전 이슈 (현재 스프린트 핵심 작업)
- **스프린트 연속**: `이하 스프린트 연속` 구분자 이후
- **신규**: `이하 신규` 구분자 이후
- **기술 부채**: `이하 기술 부채` 구분자 이후

#### 필터링 조건

- Status가 "In Progress"인 이슈만 표시
- Closed된 이슈는 제외
- DraftIssue(구분자)는 제외

#### 데이터 소스

- **프로젝트**: [Sprint Backlog (qb-group/projects/3)](https://github.com/orgs/qb-group/projects/3)
- **API**: GitHub GraphQL API

#### 스크립트 구조

```
1. GraphQL API로 프로젝트 아이템 조회
   - Status, FE, BE, Desc 필드 포함
   - Issue의 title, url, state 포함

2. "In Progress" 상태 필터링

3. 구분자 기반 카테고리 할당

4. Markdown 테이블 형식으로 출력
```

## 문제 해결

### gh: command not found

GitHub CLI가 설치되지 않았습니다.

```bash
brew install gh
```

### jq: command not found

jq가 설치되지 않았습니다.

```bash
brew install jq
```

### GraphQL API 권한 오류

GitHub 인증이 필요합니다.

```bash
gh auth login
gh auth refresh -s project
```

### 결과가 비어있음

- Sprint Backlog 프로젝트에 "In Progress" 상태인 이슈가 없는 경우
- 프로젝트 접근 권한이 없는 경우
