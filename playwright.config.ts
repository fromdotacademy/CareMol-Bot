import { defineConfig, devices } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Locate .env by walking up from this config file. When Playwright runs from
// a git worktree under .claude/worktrees/, the worktree itself may not have a
// .env (one lives in the parent project root); searching upward lets the
// spawned dev server pick it up without manual copying. Returns absolute path.
function findEnvFile(): string | undefined {
  let dir = __dirname;
  for (let i = 0; i < 5; i++) {
    const candidate = path.join(dir, '.env');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

const envPath = findEnvFile();

export default defineConfig({
  testDir: './tests',
  fullyParallel: false, // sequential — Firestore state is shared
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    video: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    // Runs first; creates tests/auth/google-session.json
    {
      name: 'setup',
      testMatch: '**/auth/auth.setup.ts',
      use: { channel: 'chrome' },
    },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',
        storageState: 'tests/auth/google-session.json',
      },
      dependencies: ['setup'],
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000/api/health',
    reuseExistingServer: true,
    timeout: 60_000,
    // server.ts uses `import "dotenv/config"` which reads .env from CWD by
    // default. Override with the resolved absolute path so a fresh worktree
    // server inherits the parent project's credentials automatically.
    env: envPath ? { DOTENV_CONFIG_PATH: envPath } : {},
  },
});
