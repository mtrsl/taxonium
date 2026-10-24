const path = require("node:path");
const { test, expect, _electron: electron } = require("@playwright/test");

test.describe("BigTree desktop application", () => {
  let electronApp;
  let window;

  test.beforeAll(async () => {
    electronApp = await electron.launch({
      args: ["--use-gl=swiftshader", path.resolve(__dirname, "../main.js")],
      env: {
        ...process.env,
        NODE_ENV: "test",
      },
    });
    window = await electronApp.firstWindow();
    await window.waitForLoadState("domcontentloaded");
  });

  test.afterAll(async () => {
    if (electronApp) await electronApp.close();
  });

  test("opens the current local-file landing page with a sandboxed renderer", async () => {
    await expect(window).toHaveTitle("BigTree");
    await expect(window.getByRole("heading", { name: "Open a local dataset" })).toBeVisible();
    await expect(window.getByRole("button", { name: "Choose files" })).toBeVisible();
    const security = await window.evaluate(() => ({
      node: typeof process,
      electronBridge: typeof window.electronAPI,
      origin: window.location.origin,
    }));
    expect(security.node).toBe("undefined");
    expect(security.electronBridge).toBe("undefined");
    expect(security.origin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  });

  test("loads a local tree and metadata through the existing browser workflow", async () => {
    const fixtures = path.join(__dirname, "fixtures");
    await window.locator('input[aria-label="Choose local files"]').setInputFiles([
      path.join(fixtures, "tree.nwk"),
      path.join(fixtures, "metadata.csv"),
    ]);
    await expect(window.getByText("tree.nwk", { exact: false })).toBeVisible();
    await window.getByRole("button", { name: "Open dataset" }).click();
    await expect(window.locator("canvas#deckgl-overlay")).toBeVisible({ timeout: 30000 });
    await expect(window.getByText(/Displaying 3 sequences/)).toBeVisible();
    await expect(window.getByRole("button", { name: "Open another dataset" })).toBeVisible();
  });
});
