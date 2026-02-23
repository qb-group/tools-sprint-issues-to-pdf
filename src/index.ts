import * as _ from 'lodash';
import ora from 'ora';
import { consola } from "consola";
import { GITHUB_PROJECT, getProjectIssues, getProjectInfo, getProjectItemsForMarkdown } from './github';
// import GithubMockupJson from '../github-response-mockup/multiple-status-issues.json';
import { generatePdf } from './pdf';
import { generateMarkdown } from './markdown';
import { uploadToOneDriveExcel } from './onedrive';

(async () => {

  consola.box("Github issues To PDF");

  let spinner = ora('Loading project').start();
  const projectInfo: GITHUB_PROJECT = await getProjectInfo();
  spinner.succeed('Load project done!');

  if (!projectInfo || !projectInfo.number) {
    consola.warn("Invalid github information. Check .env file");
    return;
  }

  consola.info(`Github Project: "${projectInfo.title}"`);
  // consola.info(`\tStatus: "${projectInfo.statusFields}"`);
  if (_.difference(projectInfo.columns, projectInfo.statusFields).length !== 0) { // isSubset false
    console.error(`The given status(${projectInfo.columns.join(',')}) are not subset of status fields(${projectInfo.statusFields.join(',')})`)
    process.exit(-1)
  }
  consola.info(`Columns: ${projectInfo.columns?.map((column) => `"${column}"`)}`);
  if (projectInfo.iterations) {
    consola.info(`Interations: ${JSON.stringify(projectInfo.iterations)}`);
  }

  const answer = projectInfo.isSkipPrompt || await consola.prompt("Do you want to proceed?", {
    type: "confirm",
  });

  if (answer) {
    spinner.start('Loading github issues');
    const [issues, markdownItems] = await Promise.all([
      getProjectIssues(),              // For PDF
      getProjectItemsForMarkdown()     // For markdown (includes DraftIssues)
    ]);
    spinner.succeed('Load github issues done!');
    // console.log(JSON.stringify(issues));

    spinner.start('Generating outputs');
    const [pdfResults, markdownResults] = await Promise.all([
      generatePdf(projectInfo, issues),
      generateMarkdown(projectInfo, markdownItems)
    ]);
    spinner.succeed('Generated outputs!');

    consola.info('PDF files:');
    for (const item of pdfResults) {
      consola.info(`  ${item}`);
    }

    consola.info('Markdown files:');
    for (const item of markdownResults) {
      consola.info(`  ${item.filepath}`);
    }

    if (!process.env.ONDRIVE_FILE_LINK) {
      consola.info('ONDRIVE_FILE_LINK not set — skipping OneDrive Excel upload');
    } else if (!process.env.AZURE_CLIENT_SECRET) {
      consola.warn('AZURE_CLIENT_SECRET not set — skipping OneDrive Excel upload');
    } else {
      spinner.start('Uploading to OneDrive Excel');
      try {
        const sheetName = await uploadToOneDriveExcel(markdownResults);
        spinner.succeed('Uploaded to OneDrive Excel!');
        consola.info(`  Sheet: ${sheetName}`);
      } catch (err: any) {
        spinner.fail('OneDrive upload failed');
        consola.error(err.message);
      }
    }
  }
})();
