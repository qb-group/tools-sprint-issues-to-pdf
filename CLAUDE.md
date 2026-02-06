# Claude Code Context

## Project Overview

This tool fetches issues from GitHub Projects (v2) and generates reports:
- TypeScript app: Both PDF and Markdown generation (`src/`)
- Unified data fetching: Single GraphQL query for both outputs (optimized performance)

## Quick Start

```bash
# Install dependencies
pnpm install

# Setup environment (see Environment Setup below for details)
cp .env.bw .env  # Use .env.bw or .env.irp as template, or create new .env
# Edit .env with your GITHUB_TOKEN, GITHUB_ORG, GITHUB_PROJECT_ID, GITHUB_PROJECT_STATUS

# Run
pnpm start
# Generates: output/{project}_{status}_{date}.pdf + .md

# Build (optional)
pnpm build

# Test GraphQL queries
# Open test/github-graphql.rest in VSCode with REST Client extension
```

## Environment Setup

- `.env` file required - contains `GITHUB_TOKEN`, `GITHUB_ORG`, `GITHUB_PROJECT_ID`, `GITHUB_PROJECT_STATUS`

**Create .env file:**
```bash
GITHUB_TOKEN=ghp_xxxxxxxxxxxx  # GitHub personal access token (classic)
GITHUB_ORG=your-org-name
GITHUB_PROJECT_ID=3            # Project number (from URL)
GITHUB_PROJECT_STATUS=Planning  # Single status: "Planning" or multiple: "Planning,In Progress,Done"
SKIP_PROMPT=true               # Optional: skip confirmation prompt
```

**Token permissions required:**
- `repo:all` - Access repositories
- `admin:org:read:org` - Read organization data
- `project:all` - Access projects

- PDF generation uses `puppeteer` with Chrome at `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`
- All data fetching done via `@octokit/graphql` in TypeScript

## GitHub GraphQL Patterns

### ProjectV2 API Pagination
- Projects can have 900+ items - must use pagination with `pageInfo.hasNextPage` and `endCursor`
- Max 100 items per page: `items(first: 100, after: $cursor)`
- Always check `totalCount` before assuming first page has everything

### Custom Fields
- This project uses custom ProjectV2 fields: `FE` (number), `BE` (number), `Desc` (text), `Status` (single select)
- Access via `fieldValueByName(name: "FieldName")` with type-specific fragments
- Example: `... on ProjectV2ItemFieldNumberValue { number }`
- Query includes direct field access: `fe: fieldValueByName(name: "FE")`, `be: fieldValueByName(name: "BE")`, `desc: fieldValueByName(name: "Desc")`

### Issue vs DraftIssue
- Regular issues have `url` and `state` fields
- DraftIssues (no `url`) are used as category separators in markdown output
- Pattern: titles like "이하 스프린트 연속", "이하 신규", "이하 기술 부채"
- GraphQL query includes both: `... on Issue { ... }` and `... on DraftIssue { title }`

## Performance Optimization

### Single Data Fetch Pattern
- **Old approach**: Bash script + TypeScript app = 2 separate API calls
- **New approach**: Single GraphQL fetch → parallel markdown + PDF generation
- Eliminates ~50% API call overhead
- Uses `Promise.all()` for parallel output generation

### Filter Early Pattern
- Filter items during data processing, not in loops
- For PDF: Filter out DraftIssues and closed issues in `getProjectIssues()`
- For Markdown: Keep DraftIssues (category separators), exclude closed in `getProjectItemsForMarkdown()`

## Code Organization

### src/github-api.ts
- GraphQL queries and client configuration
- Single unified query includes: FE, BE, Desc fields + Issue/DraftIssue content

### src/github.ts
- `getProjectIssues()`: Returns filtered issues for PDF (excludes DraftIssues)
- `getProjectItemsForMarkdown()`: Returns raw items for markdown (includes DraftIssues)
- Both use same underlying `getProjectItems()` with pagination

### src/markdown.ts
- `generateMarkdown()`: Orchestrates markdown generation per status column
- `generateMarkdownTable()`: Formats markdown table with category tracking
- Category detection from DraftIssue titles: "이하 스프린트 연속" → "연속", etc.
- Outputs: `output/{title}_{status}_{date}.md`
- Number formatting: integers show as `1.0`, decimals as `1.5`

### src/pdf.ts
- PDF generation from issue data (unchanged)

### src/index.ts
- Parallel execution: `Promise.all([getProjectIssues(), getProjectItemsForMarkdown()])`
- Parallel output: `Promise.all([generatePdf(), generateMarkdown()])`

## Testing

- Use `test/github-graphql.rest` with VSCode REST Client for API testing
- Full pipeline: `pnpm start` (generates both markdown + PDF)
- Output files in `output/` directory: `.md` and `.pdf` files

## Common Issues

- **Missing issues**: Check pagination - project may have >100 items
- **GraphQL errors**: Verify token has `repo:all`, `admin:org:read:org`, `project:all` scopes
- **Puppeteer errors**: Update `executablePath` in `src/pdf.ts` for your Chrome location

**Chrome path fix:**
```typescript
// src/pdf.ts:65
executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',  // macOS
// executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',  // Windows
// executablePath: '/usr/bin/google-chrome',  // Linux
```
