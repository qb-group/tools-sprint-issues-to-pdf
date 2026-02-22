import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { DeviceCodeCredential } from '@azure/identity';
import { MarkdownResult } from './markdown';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const TOKEN_CACHE_PATH = path.join(process.cwd(), '.onedrive-token.json');

interface CachedToken {
  token: string;
  expiresAt: number;
}

function loadCachedToken(): string | null {
  try {
    if (fs.existsSync(TOKEN_CACHE_PATH)) {
      const cache: CachedToken = JSON.parse(fs.readFileSync(TOKEN_CACHE_PATH, 'utf-8'));
      if (cache.expiresAt > Date.now() + 60_000) return cache.token;
    }
  } catch {}
  return null;
}

function saveCachedToken(token: string, expiresAt: number): void {
  fs.writeFileSync(TOKEN_CACHE_PATH, JSON.stringify({ token, expiresAt }), 'utf-8');
}

async function getAccessToken(): Promise<string> {
  const cached = loadCachedToken();
  if (cached) return cached;

  const credential = new DeviceCodeCredential({
    tenantId: process.env.AZURE_TENANT_ID ?? 'organizations',
    clientId: process.env.AZURE_CLIENT_ID!,
    userPromptCallback: (info) => {
      console.log('\n' + info.message);
    },
  });

  const tokenResult = await credential.getToken('https://graph.microsoft.com/.default');
  if (!tokenResult) throw new Error('Failed to acquire access token');
  saveCachedToken(tokenResult.token, tokenResult.expiresOnTimestamp);
  return tokenResult.token;
}

async function resolveShareLink(shareUrl: string, token: string): Promise<{ driveId: string; itemId: string }> {
  const encoded = Buffer.from(shareUrl)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  const { data } = await axios.get(`${GRAPH_BASE}/shares/u!${encoded}/driveItem`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return { driveId: data.parentReference.driveId, itemId: data.id };
}

async function ensureWorksheet(
  driveId: string,
  itemId: string,
  sheetName: string,
  token: string,
): Promise<void> {
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const url = `${GRAPH_BASE}/drives/${driveId}/items/${itemId}/workbook/worksheets`;
  const { data } = await axios.get(url, { headers });
  const exists = data.value.some((s: any) => s.name === sheetName);
  if (!exists) {
    await axios.post(`${url}/add`, { name: sheetName }, { headers });
  }
}

function isSeparatorRow(cells: string[]): boolean {
  return cells.length > 0 && cells.every((c) => /^[\s\-:]+$/.test(c));
}

function stripMarkdown(cell: string): string {
  // Strip bold markers and extract link text from [text](url)
  const linkMatch = cell.match(/^\[(.+?)\]\(.+?\)$/);
  if (linkMatch) return linkMatch[1];
  return cell.replace(/\*\*/g, '');
}

function markdownToRows(content: string, status: string): (string | number)[][] {
  const rows: (string | number)[][] = [];
  rows.push([status]); // Section header

  for (const line of content.split('\n')) {
    if (!line.startsWith('|')) continue;
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((c) => c.trim());
    if (isSeparatorRow(cells)) continue;

    const row: (string | number)[] = cells.map((cell) => {
      const text = stripMarkdown(cell);
      const num = Number(text);
      return !isNaN(num) && text !== '' ? num : text;
    });
    rows.push(row);
  }

  rows.push([]); // Empty row between sections
  return rows;
}

async function writeWorksheet(
  driveId: string,
  itemId: string,
  sheetName: string,
  allRows: (string | number)[][],
  token: string,
): Promise<void> {
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const base = `${GRAPH_BASE}/drives/${driveId}/items/${itemId}/workbook/worksheets('${encodeURIComponent(sheetName)}')`;

  // Clear existing content (ignore error on empty sheet)
  try {
    await axios.post(`${base}/usedRange/clear`, { applyTo: 'Contents' }, { headers });
  } catch {}

  if (allRows.length === 0) return;

  const maxCols = Math.max(...allRows.map((r) => r.length), 1);
  const colLetter = String.fromCharCode(64 + maxCols);
  const range = `A1:${colLetter}${allRows.length}`;

  const padded = allRows.map((row) => {
    const r: (string | number)[] = [...row];
    while (r.length < maxCols) r.push('');
    return r;
  });

  await axios.patch(`${base}/range(address='${range}')`, { values: padded }, { headers });
}

/**
 * Upload markdown results to an OneDrive Excel worksheet named with today's date.
 * Creates the worksheet if it doesn't exist; updates it if it does.
 * @returns the worksheet name (yyyy-MM-dd)
 */
export async function uploadToOneDriveExcel(markdownFiles: MarkdownResult[]): Promise<string> {
  const shareUrl = process.env.ONDRIVE_FILE_LINK!;
  const token = await getAccessToken();
  const { driveId, itemId } = await resolveShareLink(shareUrl, token);

  const sheetName = new Date().toISOString().split('T')[0]; // yyyy-MM-dd
  await ensureWorksheet(driveId, itemId, sheetName, token);

  const allRows: (string | number)[][] = [];
  for (const file of markdownFiles) {
    allRows.push(...markdownToRows(file.content, file.status));
  }

  await writeWorksheet(driveId, itemId, sheetName, allRows, token);
  return sheetName;
}
