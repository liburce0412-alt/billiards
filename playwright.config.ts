import { defineConfig } from "@playwright/test"

const chromePath =
  process.env.PLAYWRIGHT_CHROME_PATH ??
  (process.platform === "win32"
    ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
    : undefined)

export default defineConfig({
  testDir: "./e2e",
  snapshotPathTemplate: "{testDir}/{testFilePath}-snapshots/{arg}{ext}",
  fullyParallel: false,
  retries: 0,
  reporter: "line",
  use: {
    baseURL: "http://127.0.0.1:4173",
    colorScheme: "dark",
    locale: "zh-CN",
    launchOptions: {
      executablePath: chromePath,
    },
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "node node_modules/http-server/bin/http-server dist -p 4173 -c-1",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
    timeout: 30_000,
  },
})
