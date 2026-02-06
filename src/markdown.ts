import * as _ from 'lodash';
import * as fs from 'fs';
import * as path from 'path';
import { GITHUB_PROJECT } from './github';

interface MarkdownItem {
  title: string;
  url: string | null;
  fe: number | null;
  be: number | null;
  desc: string | null;
}

/**
 * Generate markdown tables for each status column
 * @param projectInfo project information
 * @param items raw project items (includes DraftIssues)
 * @returns array of generated file paths
 */
export const generateMarkdown = async (
  projectInfo: GITHUB_PROJECT,
  items: any[]
): Promise<string[]> => {
  const results: string[] = [];
  const outputDir = path.join(process.cwd(), 'output');

  // Create output directory if it doesn't exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Group items by status
  const itemsByStatus = _.groupBy(items, (item) => item.fieldValueByName?.name);

  // Generate markdown for each status column
  for (const status of projectInfo.columns) {
    const statusItems = itemsByStatus[status] || [];
    const markdown = generateMarkdownTable(statusItems);

    // Generate filename matching PDF naming convention
    const currentDate = new Date().toISOString().split('T')[0]; // yyyy-MM-dd
    const sanitizedStatus = status.replace(/\s+/g, '_');
    const sanitizedTitle = projectInfo.title.replace(/\s+/g, '_');
    const filename = `${sanitizedTitle}_${sanitizedStatus}_${currentDate}.md`;
    const filepath = path.join(outputDir, filename);

    // Write to file
    fs.writeFileSync(filepath, markdown, 'utf-8');
    results.push(filepath);
  }

  return results;
};

/**
 * Generate markdown table from items
 * @param items project items for a specific status
 * @returns markdown string
 */
const generateMarkdownTable = (items: any[]): string => {
  const lines: string[] = [];

  // Table header
  lines.push('| # | 구분 | 이슈 | FE | BE | Desc |');
  lines.push('|---|------|------|:--:|:--:|------|');

  // Category tracking
  let category = '';
  let count = 0;
  let feTotal = 0;
  let beTotal = 0;

  // Process each item
  for (const item of items) {
    const title = item.content?.title || '';
    const url = item.content?.url || null;
    const fe = item.fe?.number ?? null;
    const be = item.be?.number ?? null;
    const desc = item.desc?.text ?? null;

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
    }

    // Skip DraftIssues (separators) - they don't have URLs
    if (!url) {
      continue;
    }

    // Increment counter
    count++;

    // Add to totals
    feTotal += fe ?? 0;
    beTotal += be ?? 0;

    // Format values (null -> "-", numbers with .0 for integers)
    const feDisplay = fe !== null ? (Number.isInteger(fe) ? `${fe}.0` : fe.toString()) : '-';
    const beDisplay = be !== null ? (Number.isInteger(be) ? `${be}.0` : be.toString()) : '-';
    const descDisplay = desc !== null ? desc : '-';

    // Add table row
    lines.push(`| ${count} | ${category} | [${title}](${url}) | ${feDisplay} | ${beDisplay} | ${descDisplay} |`);
  }

  // Add total row
  lines.push(`| | **Total** | | **${feTotal}** | **${beTotal}** | |`);

  return lines.join('\n') + '\n';
};
