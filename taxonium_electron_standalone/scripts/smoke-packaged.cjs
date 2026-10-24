const fs = require("node:fs");
const path = require("node:path");
const { _electron: electron } = require("@playwright/test");

const dist = path.resolve(__dirname, "../dist");

function findExecutable(directory) {
  if (!fs.existsSync(directory)) return undefined;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      const found = findExecutable(candidate);
      if (found) return found;
    } else if (process.platform === "darwin" && entry.name === "BigTree" && candidate.includes(`${path.sep}MacOS${path.sep}`)) {
      return candidate;
    } else if (process.platform === "win32" && entry.name === "BigTree.exe" && candidate.includes(`${path.sep}win-unpacked${path.sep}`)) {
      return candidate;
    } else if (process.platform === "linux" && entry.name.toLowerCase() === "bigtree" && candidate.includes(`${path.sep}linux-unpacked${path.sep}`)) {
      return candidate;
    }
  }
}

function findAsar(executable) {
  let directory = path.dirname(executable);
  while (directory.startsWith(dist)) {
    for (const name of ["resources", "Resources"]) {
      const candidate = path.join(directory, name, "app.asar");
      if (fs.existsSync(candidate)) return candidate;
    }
    directory = path.dirname(directory);
  }
}

async function main() {
  const executable = findExecutable(dist);
  if (!executable) throw new Error(`Could not find the unpacked BigTree executable under ${dist}`);
  const appAsar = findAsar(executable);
  if (!appAsar) throw new Error(`Could not find app.asar for ${executable}`);
  if (process.platform === "darwin" && !fs.existsSync(path.join(path.dirname(appAsar), "icons", "dock.png"))) {
    throw new Error("The packaged macOS Dock icon is missing from the resources directory.");
  }
  if (process.platform === "darwin" && !fs.existsSync(path.join(path.dirname(appAsar), "icon.icns"))) {
    throw new Error("The packaged macOS app icon is missing from the resources directory.");
  }
  if (process.platform === "linux" && !fs.existsSync(path.join(path.dirname(appAsar), "icons", "bigtree.png"))) {
    throw new Error("The packaged Linux window icon is missing from the resources directory.");
  }

  const app = await electron.launch({ executablePath: executable, args: ["--use-gl=swiftshader", appAsar], timeout: 60000 });
  try {
    const window = await app.firstWindow();
    await window.waitForLoadState("domcontentloaded", { timeout: 30000 });
    if (await window.title() !== "BigTree") throw new Error(`Unexpected packaged title: ${await window.title()}`);
    const security = await window.evaluate(() => ({ node: typeof process, bridge: typeof window.electronAPI }));
    if (security.node !== "undefined" || security.bridge !== "undefined") throw new Error("Packaged renderer has privileged APIs enabled.");
    const heading = window.getByRole("heading", { name: "Open a local dataset" });
    if (!(await heading.isVisible())) throw new Error("Packaged local-file landing page did not render.");
    const fixtures = path.resolve(__dirname, "../e2e/fixtures");
    await window.locator('input[aria-label="Choose local files"]').setInputFiles([
      path.join(fixtures, "tree.nwk"),
      path.join(fixtures, "metadata.csv"),
    ]);
    await window.getByRole("button", { name: "Open dataset" }).click();
    await window.locator("canvas#deckgl-overlay").waitFor({ state: "visible", timeout: 60000 });
    await window.getByText(/Displaying 3 sequences/).waitFor({ state: "visible", timeout: 10000 });
    console.log(`Packaged BigTree smoke launch passed: ${executable}`);
  } finally {
    await app.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
