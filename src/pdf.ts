import * as fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import puppeteer from 'puppeteer';
import Handlebars from 'handlebars';
import * as _ from 'lodash';
import { format } from 'date-fns';
import PDFMerger from 'pdf-merger-js';
import { GITHUB_ISSUE, GITHUB_PROJECT } from './github';


const TEMPLATE_BASE_PATH = `${__dirname}/../html-templates`;
const TEMPLATES = [
  {
    name: 'primer',
    path: `${TEMPLATE_BASE_PATH}/primer-template.html`
  },
  {
    name: 'alex',
    path: `${TEMPLATE_BASE_PATH}/alex-template.html`
  }
];
const DEFAULT_TEMPLATE: string = 'primer';

const loadTemplate = async (name: string): Promise<string> => {
  const template = _.find(TEMPLATES, {name: name});

  if (!template) {
    console.error('[pdf/compileTemplate] template name is undefined.', name);
    throw new Error('Undefined template name');
  }

  let source: string = '';
  try {
    source = await fs.readFile(template.path, 'utf-8');
    // console.log('[pdf/compileTemplate] read template file : ', template.name)
  } catch (error) {
    console.error('[pdf/compileTemplate] read template failed. error', error);
    throw error;
  }

  return source;
};

const generatePdfFromIssues = async (fileName: string, issues: GITHUB_ISSUE[]) => {
  const OUTPUT_PATH = 'output';
  const SAVED_PATH = `${__dirname}/../${OUTPUT_PATH}`;
  const templateSource = await loadTemplate(DEFAULT_TEMPLATE);
  const template = Handlebars.compile(templateSource);


  const htmlIssues: string[] = issues.map((issue) => {
    const createdDate: string = issue.createdAt ? (new Date(issue.createdAt)).toDateString() : '';
    const repoNames: string[] = issue.repoNameWithOwner ? _.split(issue.repoNameWithOwner, '/') : ['', ''];
    return template({
      ...issue,
      repoOwner: repoNames[0],
      repoName: repoNames[1],
      createdDate: createdDate
    });
  });

  const browser = await puppeteer.launch({
    // headless: false,
    // NOTE: change executeablePath for your system
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: [
      '--disable-features=IsolateOrigins',
      '--disable-site-isolation-trials',
      '--autoplay-policy=user-gesture-required',
      '--disable-background-networking',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-breakpad',
      '--disable-client-side-phishing-detection',
      '--disable-component-update',
      '--disable-default-apps',
      '--disable-dev-shm-usage',
      '--disable-domain-reliability',
      '--disable-extensions',
      '--disable-features=AudioServiceOutOfProcess',
      '--disable-hang-monitor',
      '--disable-ipc-flooding-protection',
      '--disable-notifications',
      '--disable-offer-store-unmasked-wallet-cards',
      '--disable-popup-blocking',
      '--disable-print-preview',
      '--disable-prompt-on-repost',
      '--disable-renderer-backgrounding',
      '--disable-setuid-sandbox',
      '--disable-speech-api',
      '--disable-sync',
      '--hide-scrollbars',
      '--ignore-gpu-blacklist',
      '--metrics-recording-only',
      '--mute-audio',
      '--no-default-browser-check',
      '--no-first-run',
      '--no-pings',
      '--no-sandbox',
      '--no-zygote',
      '--password-store=basic',
      '--use-gl=swiftshader',
      '--use-mock-keychain'
    ]
  });

  const merger = new PDFMerger();
  for (const item of htmlIssues) {
    const page = await browser.newPage();
    await page.setContent(item);

    // generate one page pdf buffer
    const pdf = await page.pdf({format: 'A4', pageRanges: '1'});
    await merger.add(pdf);
  }
  await browser.close();
  // const fileName = `${projectInfo.title}_${format(new Date(), 'yyyy-MM-dd')}.pdf`;

  if (!existsSync(SAVED_PATH)) {
    await fs.mkdir(SAVED_PATH);
  }

  await merger.save(`${SAVED_PATH}/${fileName}`);
  
  return `${OUTPUT_PATH}/${fileName}`;  
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

function extractDateCode(issues: GITHUB_ISSUE[]): string {
  const first = issues[0];
  if (first) {
    // Option 1: title "Sprint ~YYMMDD"
    const titleMatch = (first.title ?? '').match(/Sprint\s*~\s*(\d{6})/i);
    if (titleMatch) {
      assertNotPast(titleMatch[1]);
      return titleMatch[1];
    }

    // Option 2: iteration field named "Sprint" with title containing YYMMDD
    for (const iter of first.iterations ?? []) {
      if (/sprint/i.test(iter.name)) {
        const iterMatch = iter.title.match(/Sprint[:\s~]+(\d{6})/i);
        if (iterMatch) {
          assertNotPast(iterMatch[1]);
          return iterMatch[1];
        }
      }
    }
  }

  // Option 3: today YYMMDD
  const today = new Date();
  return String(today.getFullYear()).slice(2) +
    String(today.getMonth() + 1).padStart(2, '0') +
    String(today.getDate()).padStart(2, '0');
}

export const generatePdf = async (projectInfo: GITHUB_PROJECT, issues: GITHUB_ISSUE[]): Promise<string[]> => {
  const dateCode = extractDateCode(issues);
  const statusGroup: any = _.groupBy(issues, (issue) => issue.status);
  let results: string[] = [];

  for (var key in statusGroup){
    const fileName = `${projectInfo.title}_${key}_${dateCode}.pdf`;
    results.push(await generatePdfFromIssues(fileName, statusGroup[key]));
  }
  return results;
}
