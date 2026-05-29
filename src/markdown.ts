import * as _ from 'lodash';
import * as fs from 'fs';
import * as path from 'path';
import { GITHUB_PROJECT } from './github';

export interface MarkdownResult {
  filepath: string;
  content: string;
  status: string;
  sheetName: string;
}

/**
 * Determine Excel worksheet name from sprint data.
 * Priority:
 *   1. First issue title matching "Sprint ~YYMMDD"
 *   2. First issue's iteration field named "Sprint" with title containing YYMMDD
 *   3. Today's date as YYMMDD
 * Throws if the extracted sprint date is in the past.
 */
function extractSheetName(items: any[]): string {
  const firstIssue = items.find((item) => item.content?.url);
  if (firstIssue) {
    // Option 1: title "Sprint ~YYMMDD"
    const titleMatch = (firstIssue.content?.title ?? '').match(/Sprint\s*~\s*(\d{6})/i);
    if (titleMatch) {
      assertNotPast(titleMatch[1]);
      return titleMatch[1];
    }

    // Option 2: iteration field named "Sprint" with title containing YYMMDD
    for (const node of firstIssue.fieldValues?.nodes ?? []) {
      if (/sprint/i.test(node.field?.name ?? '') && node.title) {
        const iterMatch = (node.title as string).match(/Sprint[:\s~]+(\d{6})/i);
        if (iterMatch) {
          assertNotPast(iterMatch[1]);
          return iterMatch[1];
        }
      }
    }
  }

  // Option 3: today YYMMDD
  const today = new Date();
  const yy = String(today.getFullYear()).slice(2);
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  return `${yy}${mm}${dd}`;
}

/** Throws if the YYMMDD code refers to a date strictly before today. */
function assertNotPast(yymmdd: string): void {
  const yy = parseInt(yymmdd.slice(0, 2), 10);
  const mm = parseInt(yymmdd.slice(2, 4), 10) - 1;
  const dd = parseInt(yymmdd.slice(4, 6), 10);
  const sprintDate = new Date(2000 + yy, mm, dd);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (sprintDate < today) {
    const fmt = `20${yymmdd.slice(0, 2)}-${yymmdd.slice(2, 4)}-${yymmdd.slice(4, 6)}`;
    throw new Error(`스프린트 날짜(${fmt})가 오늘(${today.toISOString().slice(0, 10)})보다 과거입니다. 다음 스프린트 날짜를 확인해 주세요.`);
  }
}

/**
 * Generate markdown tables for each status column
 * @param projectInfo project information
 * @param items raw project items (includes DraftIssues)
 * @returns array of generated file info (path, content, status)
 */
export const generateMarkdown = async (
  projectInfo: GITHUB_PROJECT,
  items: any[]
): Promise<MarkdownResult[]> => {
  const results: MarkdownResult[] = [];
  const outputDir = path.join(process.cwd(), 'output');

  // Create output directory if it doesn't exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const sheetName = extractSheetName(items);

  // Group items by status
  const itemsByStatus = _.groupBy(items, (item) => item.fieldValueByName?.name);

  // Generate markdown for each status column
  for (const status of projectInfo.columns) {
    const statusItems = itemsByStatus[status] || [];
    const markdown = generateMarkdownTable(statusItems);

    // Generate filename: use sprint date (YYMMDD) from sheetName
    const sanitizedStatus = status.replace(/\s+/g, '_');
    const sanitizedTitle = projectInfo.title.replace(/\s+/g, '_');
    const filename = `${sanitizedTitle}_${sanitizedStatus}_${sheetName}.md`;
    const filepath = path.join(outputDir, filename);

    // Write to file
    fs.writeFileSync(filepath, markdown, 'utf-8');
    results.push({ filepath, content: markdown, status, sheetName });
  }

  return results;
};

/**
 * Collect unique number field names from all items (preserving first-appearance order)
 */
const collectNumberFieldNames = (items: any[]): string[] => {
  const names: string[] = [];
  for (const item of items) {
    for (const node of item.fieldValues?.nodes ?? []) {
      if (_.isNumber(node.number) && node.field?.name && !names.includes(node.field.name)) {
        names.push(node.field.name);
      }
    }
  }
  return names;
};

/**
 * Generate markdown table from items
 * @param items project items for a specific status
 * @returns markdown string
 */
const generateMarkdownTable = (items: any[]): string => {
  const lines: string[] = [];

  // Discover number fields dynamically
  const numberFields = collectNumberFieldNames(items);

  // Table header
  const numHeaders = numberFields.map((name) => `| ${name} `).join('');
  const numSeps = numberFields.map(() => `|:--:`).join('');
  lines.push(`| # | 구분 | 이슈 ${numHeaders}| Desc |`);
  lines.push(`|---|------|------${numSeps}|------|`);

  // Category tracking
  let category = '';
  let count = 0;
  const totals: Record<string, number> = {};
  numberFields.forEach((name) => { totals[name] = 0; });

  // Process each item
  for (const item of items) {
    const title = item.content?.title || '';
    const url = item.content?.url || null;
    const desc = item.desc?.text ?? null;

    // Build number values map for this item
    const numValues: Record<string, number | null> = {};
    numberFields.forEach((name) => { numValues[name] = null; });
    for (const node of item.fieldValues?.nodes ?? []) {
      if (_.isNumber(node.number) && node.field?.name && Object.prototype.hasOwnProperty.call(numValues, node.field.name)) {
        numValues[node.field.name] = node.number;
      }
    }

    // Check for category separators (DraftIssues with special titles)
    if (title.includes('이하 스프린트 연속')) {
      category = '연속';
      continue;
    } else if (title.includes('이하 신규')) {
      category = '신규';
      continue;
    } else if (title.includes('이하 기술 부채')) {
      category = '부채';
      continue;
    } else if (title.includes('이하 SPEC&PLAN')) {
      category = '기획';
      continue;
    } else if (title.includes('이하 opt')) {
      category = '선택';
      continue;
    }

    // Skip DraftIssues (separators) - they don't have URLs
    if (!url) {
      continue;
    }

    // Increment counter
    count++;

    // Add to totals
    numberFields.forEach((name) => { totals[name] += numValues[name] ?? 0; });

    // Format values (null -> "-", numbers with .0 for integers)
    const numCells = numberFields
      .map((name) => {
        const val = numValues[name];
        const display = val !== null ? (Number.isInteger(val) ? `${val}.0` : val.toString()) : '-';
        return `| ${display} `;
      })
      .join('');
    const descDisplay = desc !== null ? desc : '-';

    // Add table row
    lines.push(`| ${count} | ${category} | [${title}](${url}) ${numCells}| ${descDisplay} |`);
  }

  // Add total row
  const totalCells = numberFields.map((name) => `| **${totals[name]}** `).join('');
  lines.push(`| | **Total** | ${totalCells}| |`);

  return lines.join('\n') + '\n';
};
