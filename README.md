# issues-to-pdf
: GitHub Projects (v2)에서 사용자가 선택한 Status 필드의 모든 issue를 PDF와 Markdown 형태로 제공

## Features
- 📄 **PDF 생성**: 이슈 상세 정보를 포함한 PDF 문서
- 📝 **Markdown 테이블**: 스프린트 현황을 한눈에 볼 수 있는 마크다운 테이블
- ⚡ **최적화된 성능**: 단일 GraphQL 쿼리로 데이터를 가져와 병렬 처리
- 🎯 **카테고리 분류**: DraftIssue를 활용한 자동 카테고리 구분 (연속/신규/부채)
- ☁️ **OneDrive Excel 업로드** (선택): Markdown 결과를 SharePoint Excel 시트에 자동 업로드


### Prerequisites
- GitHub GraphQL API
  - [docs](https://docs.github.com/ko/graphql)
  - [apis exploerer](https://docs.github.com/ko/graphql/overview/explorer)
  - [graphql client](https://github.com/octokit/graphql.js)
  - [manage projects apis](https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/using-the-api-to-manage-projects)
  - [understand projects fields](https://docs.github.com/en/issues/planning-and-tracking-with-projects/understanding-fields/about-text-and-number-fields)
  - GraphQL Obejct
    - [ProjectV2 Object](https://docs.github.com/ko/graphql/reference/objects#projectv2)
    - [Issue Object](https://docs.github.com/ko/graphql/reference/objects#issue)


- Github Token
  - [create personal access token](https://docs.github.com/ko/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token)
  - permission
    - `repo: all`
    - `admin:org : read:org`
    - `project: all`


    > GraphQL API에 인증하려면 personal access token (classic), GitHub App 또는 OAuth App을 만들어야 합니다. GraphQL API는 fine-grained personal access tokens의 인증을 지원하지 않습니다.

- PDF Templates
  - `primer-template`: https://primer.style/css
    - primer is systematically designed for GitHub


- [pnpm](https://pnpm.io/): node package manager

### Development
: set github token in `.env`

- `.env`
  - create
  ```bash
  touch .env
  ```
  
  - set github env values
  ```yml
  GITHUB_TOKEN={my github token}
  GITHUB_ORG={my organization}
  GITHUB_PROJECT_ID={target project number}
  GITHUB_PROJECT_STATUS={status name}
  GITHUB_PROJECT_ITERATION={"iteraion name":"iteration title",...}
  SKIP_PROMPT={true|false}
  ```

    * example
      ```
      GITHUB_TOKEN=ghp_xxxxxxx
      GITHUB_ORG=jaeyong-lab
      GITHUB_PROJECT_ID=39
      # single status
      GITHUB_PROJECT_STATUS=In progress
      # multiple status
      GITHUB_PROJECT_STATUS=In progress,Epic,Next
      # interation name: title
      GITHUB_PROJECT_ITERATION={"iteraion1":"sprint 2","iteraion2":"sprint 3"}
      # skip prompt for proceed; false by default
      SKIP_PROMPT=true
      ```

    * **Custom Fields**: 프로젝트에 다음 필드가 있는 경우 자동으로 포함됩니다
      - `FE` (Number): 프론트엔드 작업량
      - `BE` (Number): 백엔드 작업량
      - `Desc` (Text): 추가 설명

  - OneDrive Excel 업로드 설정 (선택)
  ```yml
  AZURE_TENANT_ID={Azure 테넌트 ID}
  AZURE_CLIENT_ID={Azure 앱 클라이언트 ID}
  AZURE_CLIENT_SECRET={Azure 앱 클라이언트 시크릿}
  ONDRIVE_FILE_LINK={SharePoint Excel 파일 공유 링크}
  ```

    * **Azure 앱 등록 방법**:
      1. [Azure Portal](https://portal.azure.com) → Microsoft Entra ID → 앱 등록 → 새 등록
      2. API 권한 추가: `Microsoft Graph` → `Files.ReadWrite.All` (Application), `Sites.ReadWrite.All` (Application)
      3. 상단의 관리자 동의(Grant admin consent) 클릭
      4. 인증서 및 암호 → 클라이언트 암호 생성 → `AZURE_CLIENT_SECRET`에 설정

    * **Excel 공유 링크 얻기**:
      - SharePoint에서 Excel 파일 열기 → 공유 → 링크 복사 → `ONDRIVE_FILE_LINK`에 설정

    * `ONDRIVE_FILE_LINK`가 설정되지 않으면 업로드를 건너뛰고 계속 진행합니다

- Installation
  ```bash
  $ pnpm install
  ```

- Run
  ```bash
  $ pnpm start
  ```

- Result
  ```bash
    ╭────────────────────────╮
    │                        │
    │  Github issues To PDF  │
    │                        │
    ╰────────────────────────╯

    ✔ Load project done!
    ℹ Github Project: "My Project"
    ℹ Columns: "In Progress"

    ✔ Do you want to proceed?
    Yes
    - Loading github issues
    ✔ Load github issues done!
    - Generating outputs
    ✔ Generated outputs!
    ℹ PDF files:
    ℹ   output/My_Project_In_Progress_240115.pdf
    ℹ Markdown files:
    ℹ   output/My_Project_In_Progress_240115.md
    - Uploading to OneDrive Excel     (ONDRIVE_FILE_LINK 설정 시)
    ✔ Uploaded to OneDrive Excel!
    ℹ   Sheet: 240115
  ```

  **생성되는 파일** (날짜는 `YYMMDD` 형식):
  - `output/{프로젝트명}_{상태}_{YYMMDD}.pdf` - 이슈 상세 PDF
  - `output/{프로젝트명}_{상태}_{YYMMDD}.md` - 스프린트 현황 마크다운 테이블

  **YYMMDD 날짜 결정 우선순위**:
  1. 첫 번째 이슈 제목의 `Sprint ~YYMMDD` 패턴
  2. 첫 번째 이슈의 iteration 필드(`Sprint`)에서 추출
  3. 오늘 날짜

### Markdown Output Format

마크다운 파일은 다음과 같은 형식의 테이블을 생성합니다:

```markdown
| # | 구분 | 이슈 | FE | BE | Desc |
|---|------|------|:--:|:--:|------|
| 1 | 연속 | [Fix login bug](https://github.com/org/repo/issues/123) | 1.5 | 2.0 | 긴급 수정 필요 |
| 2 | 신규 | [Add user profile](https://github.com/org/repo/issues/124) | 3.0 | 1.0 | UI 디자인 완료 |
| 3 | 부채 | [Refactor API](https://github.com/org/repo/issues/125) | - | 2.5 | 성능 개선 |
| | **Total** | | **4.5** | **5.5** | |
```

**카테고리 자동 분류**:
- DraftIssue의 제목에 따라 자동으로 카테고리가 설정됩니다:
  - "이하 스프린트 연속" → `연속`
  - "이하 신규" → `신규`
  - "이하 기술 부채" → `부채`

### Architecture

- **Single Data Fetch**: GraphQL 쿼리 한 번으로 모든 데이터 수집
- **Parallel Generation**: PDF와 Markdown을 동시에 생성 (`Promise.all()`)
- **Type Safety**: 전체 코드베이스가 TypeScript로 작성됨
- **Custom Fields**: ProjectV2 커스텀 필드 (FE, BE, Desc) 지원

### Troubleshooting
- `puppeteer` execute path :  `src/pdf.ts`
    ```javascript
    // NOTE: change executeablePath for your system
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    ```

### Test
- [VSCode REST Client](https://marketplace.visualstudio.com/items?itemName=humao.rest-client)
- apis test file: `test/github-graphql.rest`


<!-- LICENSE -->
## License

Distributed under the MIT License. See `LICENSE` for more information.


<!-- CONTACT -->
## Contact

jaeyong - bluette7@gmail.com
