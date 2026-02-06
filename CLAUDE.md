# Claude Code Context

## Project Overview

This tool fetches issues from GitHub Projects (v2) and generates reports:
- TypeScript app: PDF generation (`src/`)
- Bash scripts: Markdown reports (`scripts/`)

## Environment Setup

- `.env` file required - contains `GITHUB_TOKEN`, `GITHUB_ORG`, `GITHUB_PROJECT_ID`, `GITHUB_PROJECT_STATUS`
- Scripts use `gh` CLI (GitHub CLI) + `jq` for JSON processing
- PDF generation uses `puppeteer` with Chrome at `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`

## GitHub GraphQL Patterns

### ProjectV2 API Pagination
- Projects can have 900+ items - must use pagination with `pageInfo.hasNextPage` and `endCursor`
- Max 100 items per page: `items(first: 100, after: $cursor)`
- Always check `totalCount` before assuming first page has everything

### Custom Fields
- This project uses custom ProjectV2 fields: `FE` (number), `BE` (number), `Desc` (text), `Status` (single select)
- Access via `fieldValueByName(name: "FieldName")` with type-specific fragments
- Example: `... on ProjectV2ItemFieldNumberValue { number }`

### Issue vs DraftIssue
- Regular issues have `url` field
- DraftIssues (no `url`) are used as category separators in this project
- Pattern: titles like "이하 스프린트 연속", "이하 신규", "이하 기술 부채"

## Performance Optimization

### Filter Early Pattern
- **Bad**: Fetch all items → filter in bash loops
- **Good**: Filter during GraphQL fetch → store only matches
- Example: `select(.fieldValueByName.name == $status and .content.state != "CLOSED")`
- This reduced memory 96.8% (909 → 29 items) in `sprint-current.sh`

## Scripts

### sprint-current.sh
- Generates markdown table of current sprint issues
- Uses stderr for progress logging (`>&2`)
- Pagination loop: fetch → filter → accumulate → repeat
- Category tracking via DraftIssue separators
- Total calculation excludes separator items

## Testing

- Use `test/github-graphql.rest` with VSCode REST Client for API testing
- Script output: `./scripts/sprint-current.sh` to see results
- Full pipeline: `pnpm start` (runs script + PDF generation)

## Common Issues

- **Missing issues**: Check pagination - project may have >100 items
- **GraphQL errors**: Verify token has `repo:all`, `admin:org:read:org`, `project:all` scopes
- **Puppeteer errors**: Update `executablePath` in `src/pdf.ts` for your Chrome location
