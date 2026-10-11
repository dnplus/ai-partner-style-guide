import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  timeout: 30000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list'],['json',{outputFile:'evidence/final-card/browser-results.json'}]],
  outputDir: '.test-results',
  webServer: { command: 'npm run build && npm run db:migrate:local && npm run preview', url: 'http://127.0.0.1:5188', reuseExistingServer: true, timeout: 180000 },
  use: { locale:'zh-TW', baseURL: 'http://127.0.0.1:5188', browserName:'chromium', headless:true, launchOptions:{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}, viewport:{width:1536,height:1024}, screenshot:'off',trace:'off' },
});
