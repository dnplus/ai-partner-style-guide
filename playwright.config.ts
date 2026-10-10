import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  timeout: 30000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list'],['json',{outputFile:'evidence/agent-mbti/browser-results.json'}]],
  outputDir: '.test-results',
  use: { baseURL: 'http://127.0.0.1:5188', browserName:'chromium', headless:true, launchOptions:{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}, viewport:{width:1536,height:1024}, screenshot:'off',trace:'off' },
});
