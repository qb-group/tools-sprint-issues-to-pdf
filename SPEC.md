# SPEC.md - Technical Specification

## Project Overview

**issues-to-pdf** is a tool that fetches issues from GitHub Projects (v2) and generates PDF reports. It consists of two main components:

1. **TypeScript Application**: PDF generation from GitHub issues
2. **Bash Scripts**: Markdown table generation for sprint management

## System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    User Interface                        │
├─────────────────────────────────────────────────────────┤
│  CLI (pnpm start)          Shell Scripts                │
│    │                         │                           │
│    ├─ sprint-current.sh ────┘                           │
│    └─ TypeScript App (src/index.ts)                     │
└─────────────────────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────┐
│                  Data Processing Layer                   │
├─────────────────────────────────────────────────────────┤
│  • GitHub API Client (src/github-api.ts)                │
│  • Issue Processor (src/github.ts)                      │
│  • PDF Generator (src/pdf.ts)                           │
└─────────────────────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────┐
│                  External Services                       │
├─────────────────────────────────────────────────────────┤
│  • GitHub GraphQL API (ProjectV2)                       │
│  • GitHub REST API (gh CLI)                             │
└─────────────────────────────────────────────────────────┘
```

## Component Specifications

### 1. TypeScript Application

#### 1.1 Entry Point (`src/index.ts`)
- **Purpose**: Main orchestration of the PDF generation workflow
- **Workflow**:
  1. Load environment variables from `.env`
  2. Fetch project data from GitHub
  3. Process and filter issues
  4. Generate PDF output

#### 1.2 GitHub API Client (`src/github-api.ts`)
- **Purpose**: GraphQL API communication
- **Library**: `@octokit/graphql`
- **Authentication**: GitHub Personal Access Token
- **Required Permissions**:
  - `repo: all`
  - `admin:org: read:org`
  - `project: all`

#### 1.3 GitHub Data Processor (`src/github.ts`)
- **Purpose**: Issue data transformation and filtering
- **Features**:
  - Status filtering
  - Iteration filtering
  - Custom field extraction

#### 1.4 PDF Generator (`src/pdf.ts`)
- **Purpose**: PDF document generation from HTML templates
- **Library**: `puppeteer` (Headless Chrome)
- **Template Engine**: `handlebars`
- **Template Base**: Primer CSS (GitHub's design system)
- **Output Format**: `output/{project-title}_{status}_{date}.pdf`

**Configuration**:
```typescript
{
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  format: 'A4',
  printBackground: true
}
```

### 2. Bash Scripts

#### 2.1 Sprint Current Script (`scripts/sprint-current.sh`)

**Purpose**: Generate markdown table of current sprint issues

**Requirements**:
- `gh` (GitHub CLI)
- `jq` (JSON processor)

**Algorithm**:

```
1. Load Environment Configuration
   ├─ Read .env file
   ├─ Set: ORG, PROJECT_NUM, STATUS
   └─ Defaults: qb-group, 3, "In progress"

2. Fetch All Project Items (with Pagination)
   ├─ Initialize: all_items=[], has_next_page=true
   └─ While has_next_page:
       ├─ Query GraphQL API (first: 100, after: cursor)
       ├─ Filter: Status == $STATUS AND State != CLOSED
       ├─ Extract: title, url, state, FE, BE, Desc
       ├─ Append to all_items
       └─ Update: has_next_page, end_cursor

3. Process Items
   ├─ Detect Category Separators:
   │   ├─ "이하 스프린트 연속" → category = "연속"
   │   ├─ "이하 신규" → category = "신규"
   │   └─ "이하 기술 부채" → category = "부채"
   ├─ Skip: DraftIssues (url == null)
   └─ Format: Markdown table row

4. Calculate Totals
   ├─ Filter: Real issues (exclude category separators)
   ├─ Sum: FE effort (days)
   └─ Sum: BE effort (days)

5. Output
   └─ Markdown table with totals
```

**Performance Optimization**:
- **Before**: Fetch all 909 items → Filter client-side
- **After**: Filter during fetch → Store only matching items (29)
- **Memory Reduction**: 96.8% (909 → 29 items)
- **Processing Time**: Reduced by early filtering

**GraphQL Query**:

```graphql
query {
  organization(login: $ORG) {
    projectV2(number: $PROJECT_NUM) {
      items(first: 100, after: $cursor) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          fieldValueByName(name: "Status") {
            ... on ProjectV2ItemFieldSingleSelectValue {
              name
            }
          }
          fe: fieldValueByName(name: "FE") {
            ... on ProjectV2ItemFieldNumberValue {
              number
            }
          }
          be: fieldValueByName(name: "BE") {
            ... on ProjectV2ItemFieldNumberValue {
              number
            }
          }
          desc: fieldValueByName(name: "Desc") {
            ... on ProjectV2ItemFieldTextValue {
              text
            }
          }
          content {
            ... on Issue {
              title
              url
              state
            }
            ... on DraftIssue {
              title
            }
          }
        }
      }
    }
  }
}
```

**Output Format**:

```markdown
| # | 구분 | 이슈 | FE | BE | Desc |
|---|------|------|:--:|:--:|------|
| 1 | 연속 | [Issue Title](url) | 1.0 | 2.0 | Description |
| 2 | 신규 | [Issue Title](url) | 0.5 | 1.5 | Description |
| | **Total** | | **1.5** | **3.5** | |
```

**Column Specifications**:

| Column | Type | Description | Source |
|--------|------|-------------|--------|
| # | Integer | Sequential number (excludes separators) | Computed |
| 구분 | String | Category (연속/신규/부채) | Derived from separator |
| 이슈 | Link | Issue title with GitHub URL | `content.title`, `content.url` |
| FE | Number | Frontend effort (days) | `fieldValueByName(name: "FE")` |
| BE | Number | Backend effort (days) | `fieldValueByName(name: "BE")` |
| Desc | Text | Additional description | `fieldValueByName(name: "Desc")` |

**Filtering Rules**:

1. **Status Filter**: Only items with Status = `$GITHUB_PROJECT_STATUS`
2. **State Filter**: Exclude CLOSED issues
3. **URL Filter**: Include DraftIssues only as category separators
4. **Category Detection**: Special title patterns trigger category change

## Data Models

### GitHub ProjectV2 Item

```typescript
interface ProjectV2Item {
  fieldValueByName: {
    name: string;  // Status value
  };
  fe: {
    number: number | null;  // Frontend effort
  };
  be: {
    number: number | null;  // Backend effort
  };
  desc: {
    text: string | null;  // Description
  };
  content: Issue | DraftIssue;
}
```

### Issue

```typescript
interface Issue {
  title: string;
  url: string;
  state: 'OPEN' | 'CLOSED';
  number: number;
  body: string;
  labels: Label[];
  assignees: User[];
}
```

### DraftIssue

```typescript
interface DraftIssue {
  title: string;
  // No url field (used to identify separators)
}
```

## Environment Configuration

### `.env` File Structure

```bash
# GitHub Authentication
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx

# Project Configuration
GITHUB_ORG=qb-group
GITHUB_PROJECT_ID=3

# Filtering
GITHUB_PROJECT_STATUS=In progress
# Multiple statuses (comma-separated)
# GITHUB_PROJECT_STATUS=In progress,Epic,Next

# Iteration Filtering (JSON format)
GITHUB_PROJECT_ITERATION={"iteration1":"sprint 2","iteration2":"sprint 3"}

# UI Options
SKIP_PROMPT=false  # Skip confirmation prompt
```

### Environment Variables

| Variable | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `GITHUB_TOKEN` | string | Yes | - | GitHub Personal Access Token |
| `GITHUB_ORG` | string | Yes | - | GitHub organization name |
| `GITHUB_PROJECT_ID` | number | Yes | - | Project number (not UUID) |
| `GITHUB_PROJECT_STATUS` | string | No | "In progress" | Status filter (comma-separated) |
| `GITHUB_PROJECT_ITERATION` | JSON | No | {} | Iteration name mappings |
| `SKIP_PROMPT` | boolean | No | false | Skip user confirmation |

## API Specifications

### GitHub GraphQL API

**Endpoint**: `https://api.github.com/graphql`

**Rate Limits**:
- 5,000 points per hour
- ProjectV2 queries: ~1 point per 100 items

**Pagination**:
- Cursor-based pagination
- Max items per page: 100
- Use `pageInfo.endCursor` for next page

### Custom Fields Support

GitHub ProjectV2 supports custom fields:

| Field Type | GraphQL Fragment | Example |
|------------|------------------|---------|
| Text | `ProjectV2ItemFieldTextValue` | Desc |
| Number | `ProjectV2ItemFieldNumberValue` | FE, BE |
| Date | `ProjectV2ItemFieldDateValue` | Due Date |
| Single Select | `ProjectV2ItemFieldSingleSelectValue` | Status |
| Iteration | `ProjectV2ItemFieldIterationValue` | Sprint |

## Build & Deployment

### Prerequisites

```bash
# Node.js & pnpm
brew install node pnpm

# GitHub CLI
brew install gh
gh auth login

# jq for JSON processing
brew install jq
```

### Installation

```bash
# Install dependencies
pnpm install

# Configure environment
cp .env.example .env
# Edit .env with your credentials
```

### Build

```bash
# TypeScript compilation
pnpm build

# Output: ./build directory
```

### Run

```bash
# Execute full pipeline (script + PDF)
pnpm start

# Run script only
./scripts/sprint-current.sh

# Run TypeScript app only
ts-node src/index.ts
```

## Output Specifications

### PDF Output

**Location**: `output/{project-title}_{status}_{date}.pdf`

**Format**:
- Paper: A4
- Orientation: Portrait
- Margins: Default (Primer CSS)
- Background: Printed
- Font: System font stack (Primer)

**Content Structure**:
1. Header: Project title, status, date
2. Issue list: Table format
3. Issue details: Per-issue sections with body content

### Markdown Output

**Location**: stdout

**Format**: GitHub-flavored Markdown table

**Features**:
- Hyperlinked issue titles
- Right-aligned numeric columns
- Category grouping
- Totals row

## Error Handling

### Common Errors

1. **GraphQL Permission Error**
   - Cause: Insufficient token permissions
   - Solution: Regenerate token with required scopes

2. **Project Not Found**
   - Cause: Wrong PROJECT_ID or no access
   - Solution: Verify project number and organization

3. **Pagination Timeout**
   - Cause: Too many items (>10,000)
   - Solution: Increase timeout or filter by date

4. **Puppeteer Chrome Not Found**
   - Cause: Chrome not installed or wrong path
   - Solution: Update `executablePath` in `src/pdf.ts`

## Performance Metrics

### Sprint Current Script

| Metric | Before Optimization | After Optimization |
|--------|--------------------|--------------------|
| Items fetched | 909 | 909 (paginated) |
| Items stored | 909 | 29 (filtered) |
| Memory usage | ~450KB | ~15KB |
| Processing time | ~3s | ~2s |
| Network requests | 10 | 10 |

### PDF Generation

| Metric | Value |
|--------|-------|
| Avg generation time | ~5-10s |
| PDF size (10 issues) | ~200KB |
| Memory peak | ~150MB (Puppeteer) |

## Testing

### Manual Testing

```bash
# Test GitHub GraphQL API
# See: test/github-graphql.rest
# Use VSCode REST Client extension

# Test script output
./scripts/sprint-current.sh > test-output.md

# Test PDF generation
pnpm start
# Check output/ directory
```

### API Testing File

Location: `test/github-graphql.rest`

Use with [VSCode REST Client](https://marketplace.visualstudio.com/items?itemName=humao.rest-client)

## Version History

### v1.2.0 (Current)
- Added pagination support for large projects
- Optimized memory usage in sprint-current.sh
- Added real-time filtering during fetch phase

### v1.1.0
- Added multiple status support
- Added iteration filtering
- Improved error handling

### v1.0.0
- Initial release
- Basic PDF generation
- Single status filtering

## Future Enhancements

1. **Script Improvements**
   - Add JSON output format
   - Support multiple project IDs
   - Add date range filtering

2. **PDF Features**
   - Custom templates
   - Multi-page layouts
   - Include charts/graphs

3. **Performance**
   - GraphQL query optimization
   - Parallel PDF generation
   - Caching layer

4. **Integration**
   - GitHub Actions workflow
   - Slack notifications
   - Email reports

## License

MIT License - See `LICENSE` file for details.

## References

- [GitHub GraphQL API Documentation](https://docs.github.com/en/graphql)
- [ProjectV2 API Guide](https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/using-the-api-to-manage-projects)
- [Primer CSS](https://primer.style/css)
- [Puppeteer Documentation](https://pptr.dev/)
