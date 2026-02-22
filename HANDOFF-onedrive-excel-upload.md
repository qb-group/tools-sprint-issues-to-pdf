# HANDOFF.md

> 작성일: 2026-02-22
> 브랜치: `feat/onedrive-excel-upload` (Draft PR: https://github.com/qb-group/tools-sprint-issues-to-pdf/pull/1)

---

## 1. 요청 사항

`.env`의 `ONDRIVE_FILE_LINK`에 지정된 SharePoint 공유 Excel 파일에,
`pnpm start` 실행 시 생성되는 markdown 출력을 자동으로 기록한다.

- 오늘 날짜(`yyyy-MM-dd`)로 워크시트를 생성
- 이미 존재하면 내용을 덮어씀(update)
- 인증 방식: **Device Code Flow** (브라우저 1회 로그인)

---

## 2. 구현 내용 (성공)

### 신규 파일: `src/onedrive.ts`

| 함수 | 역할 |
|------|------|
| `getAccessToken()` | Device Code Flow로 Microsoft 인증. 토큰을 `.onedrive-token.json`에 캐싱 |
| `resolveShareLink()` | SharePoint 공유 URL → Graph API `driveId` + `itemId` 추출 |
| `ensureWorksheet()` | 날짜 이름 워크시트 존재 확인 후 없으면 생성 |
| `markdownToRows()` | 마크다운 테이블 파싱 → `(string\|number)[][]` 변환 |
| `writeWorksheet()` | 기존 셀 clear 후 값 일괄 기록 (`PATCH range/values`) |
| `uploadToOneDriveExcel()` | 위 함수들을 조합한 메인 export 함수 |

**마크다운 → Excel 변환 규칙:**
- `[이슈 제목](url)` → 제목 텍스트만 기록 (URL 제거, 하이퍼링크 미적용)
- `**Total**` → `Total` (bold 마커 제거)
- 숫자 문자열(`"1.0"`, `"3"`) → 숫자 타입으로 변환
- 각 status 섹션 앞에 status 이름 행 삽입, 뒤에 빈 행 삽입

### 수정된 파일

**`src/markdown.ts`**
- `MarkdownResult` 인터페이스 export 추가
  ```typescript
  export interface MarkdownResult {
    filepath: string;
    content: string;
    status: string;
  }
  ```
- `generateMarkdown()` 반환 타입: `Promise<string[]>` → `Promise<MarkdownResult[]>`

**`src/index.ts`**
- `markdownResults` 타입 변경에 따라 로그 출력 수정 (`item` → `item.filepath`)
- markdown 생성 후 OneDrive 업로드 단계 추가:
  - `ONDRIVE_FILE_LINK` 미설정 시 → 업로드 스킵 (기존 동작 유지)
  - `AZURE_CLIENT_ID` 미설정 시 → 경고 메시지 출력 후 스킵
  - 업로드 실패 시 → 에러 로그 출력 후 프로세스 종료 없이 계속

**`tsconfig.json`**
- `"skipLibCheck": true` 추가
  - 이유: `@azure/msal-common` 15.x 및 `axios` 1.13.x 타입 정의가 현재 TypeScript 4.9.5 + `moduleResolution: node` 설정과 충돌

**`package.json` / `pnpm-lock.yaml`**
- `@azure/identity ^4.13.0` 추가
- `axios ^1.13.5` 추가

**`.gitignore`**
- `.onedrive-token.json` 추가 (토큰 캐시 파일)

**`.env`**
- `AZURE_TENANT_ID` / `AZURE_CLIENT_ID` 항목 및 앱 등록 안내 주석 추가 (값은 비어 있음)

---

## 3. 미완료 / 실패

### Azure AD 앱 미등록 (블로커)

실제 동작 테스트를 하지 못했다. OneDrive 업로드 기능은 **Azure AD 앱 등록이 완료되어야 테스트 가능**하다.

현재 `.env` 상태:
```
AZURE_TENANT_ID=organizations
AZURE_CLIENT_ID=          ← 비어 있음
```

### 미테스트 시나리오

- [ ] Device Code 인증 정상 동작 여부
- [ ] SharePoint 공유 URL → driveItem 해석 성공 여부
  (공유 링크 형식 `/:x:/s/...`이 `u!<base64>` 인코딩으로 올바르게 해석되는지)
- [ ] `usedRange/clear` API가 신규(빈) 워크시트에서 에러 없이 동작하는지
  (현재 try-catch로 감싸져 있어 무시됨)
- [ ] 컬럼 수 계산: 6컬럼이면 `F` 컬럼 → `String.fromCharCode(64 + 6)` = `'F'` ✓
  (단, 26컬럼 초과 시 깨짐 — 현재 사용 구조에서는 발생 안 함)
- [ ] 토큰 만료 후 재인증 흐름

### 이슈 하이퍼링크 미적용

이슈 셀(`이슈` 컬럼)에 클릭 가능한 Excel 하이퍼링크를 넣으려면 `=HYPERLINK("url","title")` 수식을 사용해야 한다. 현재는 제목 텍스트만 기록된다.

Graph API의 `formulas` 배열에서 일반 텍스트와 수식을 혼용하는 방식을 검토했으나, TypeScript 4.9.5 + 현재 tsconfig 제약 하에 안정적인 구현을 보장하기 어려워 단순 `values` 방식으로 결정했다.

---

## 4. 다음 단계

### Step 1: Azure AD 앱 등록 (사람이 할 작업)

1. [Azure Portal](https://portal.azure.com) → **App registrations** → New registration
2. 이름 입력, Account types: **Accounts in this organizational directory only**
3. 등록 완료 후:
   - **Authentication** → Advanced settings → **Allow public client flows** → Yes → Save
   - **API permissions** → Add permission → Microsoft Graph → Delegated → **Files.ReadWrite** → Grant admin consent
4. Overview에서 값 복사 → `.env` 업데이트:
   ```
   AZURE_TENANT_ID=<Directory (tenant) ID>
   AZURE_CLIENT_ID=<Application (client) ID>
   ```

### Step 2: 동작 테스트

```bash
pnpm start
# 처음 실행 시: 콘솔에 URL + 코드 출력 → 브라우저에서 로그인
# 이후: .onedrive-token.json에 캐싱된 토큰 사용
```

확인 포인트:
- SharePoint Excel 파일에 `2026-02-22` 워크시트 생성 여부
- 마크다운 테이블 구조가 Excel 셀에 올바르게 기록되는지
- 재실행 시 기존 내용이 덮어써지는지

### Step 3: (선택) 이슈 하이퍼링크 적용

`src/onedrive.ts`의 `markdownToRows()` 함수에서 링크 셀을 수식으로 변환:

```typescript
// 현재
if (linkMatch) return linkMatch[1];  // 제목 텍스트만

// 변경 목표
if (linkMatch) return `=HYPERLINK("${linkMatch[2]}","${linkMatch[1]}")`;
// + axios.patch의 { values: padded } → { formulas: padded } 로 변경
```

주의: `formulas` 배열에서 일반 텍스트 셀은 `"hello"` 그대로 써도 동작하나,
Graph API 공식 문서에서 명시적으로 보장하는지 확인 필요.

### Step 4: PR 리뷰 후 머지

Draft PR: https://github.com/qb-group/tools-sprint-issues-to-pdf/pull/1

---

## 5. 핵심 파일 맵

```
src/
├── index.ts       ← 오케스트레이션 (업로드 트리거 추가됨)
├── markdown.ts    ← MarkdownResult 반환 (수정됨)
├── onedrive.ts    ← OneDrive 업로드 전체 로직 (신규)
├── github.ts      ← GitHub 데이터 fetch (미수정)
├── github-api.ts  ← GraphQL 쿼리 (미수정)
└── pdf.ts         ← PDF 생성 (미수정)

.env               ← AZURE_CLIENT_ID 비어 있음 (채워야 함)
.onedrive-token.json  ← 인증 후 자동 생성됨 (gitignore됨)
```
