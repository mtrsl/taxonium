const { app, BrowserWindow, dialog, shell, session } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { createRendererServer } = require("./rendererServer.cjs");

app.setName("BigTree");
app.enableSandbox();

const rendererRoot = path.join(app.getAppPath(), "renderer");
const devServerUrl = "http://127.0.0.1:5173";
let mainWindow;
let rendererServer;
let appUrl;
let windowPromise;

async function getAppUrl() {
  if (!app.isPackaged) return devServerUrl;
  const indexPath = path.join(rendererRoot, "index.html");
  await fs.promises.access(indexPath, fs.constants.R_OK);
  if (!rendererServer) rendererServer = createRendererServer({ rendererRoot });
  return rendererServer.listen();
}

async function stopRendererServer() {
  const current = rendererServer;
  rendererServer = undefined;
  appUrl = undefined;
  if (current) await current.close();
}

function configureWindow(window) {
  const { webContents } = window;
  webContents.setWindowOpenHandler(({ url }) => {
    try {
      if (["https:", "http:"].includes(new URL(url).protocol)) void shell.openExternal(url);
    } catch {
      // Ignore malformed external navigation requests.
    }
    return { action: "deny" };
  });
  webContents.on("will-navigate", (event, url) => {
    try {
      if (appUrl && new URL(url).origin === new URL(appUrl).origin) return;
      event.preventDefault();
      if (["https:", "http:"].includes(new URL(url).protocol)) void shell.openExternal(url);
    } catch {
      event.preventDefault();
    }
  });
  webContents.on("render-process-gone", async (_event, details) => {
    if (window.isDestroyed()) return;
    const result = await dialog.showMessageBox(window, {
      type: "error",
      title: "BigTree stopped unexpectedly",
      message: "The BigTree viewer stopped unexpectedly.",
      detail: `Renderer process ended (${details.reason}).`,
      buttons: ["Reload BigTree", "Quit"],
      defaultId: 0,
      cancelId: 1,
    });
    if (result.response === 0 && !window.isDestroyed()) window.webContents.reload();
    else app.quit();
  });
}

async function createWindowLoop() {
  while (!app.isQuitting) {
    let window;
    try {
      appUrl = await getAppUrl();
      window = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 800,
        minHeight: 600,
        show: false,
        title: "BigTree",
        ...(process.platform === "linux" ? {
          icon: app.isPackaged
            ? path.join(process.resourcesPath, "icons", "bigtree.png")
            : path.join(__dirname, "../electron-icon-pack/assets/linux/icon.png"),
        } : {}),
        backgroundColor: "#ffffff",
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          webSecurity: true,
          allowRunningInsecureContent: false,
          webviewTag: false,
        },
      });
      mainWindow = window;
      configureWindow(window);
      window.once("ready-to-show", () => window.show());
      window.on("closed", () => {
        if (mainWindow === window) mainWindow = null;
      });
      await window.loadURL(appUrl);
      return;
    } catch (error) {
      console.error("Failed to create the BigTree window:", error.stack || error);
      if (window && !window.isDestroyed()) window.destroy();
      mainWindow = null;
      await stopRendererServer();
      const result = await dialog.showMessageBox({
        type: "error",
        title: "Unable to start BigTree",
        message: "BigTree could not start its local viewer.",
        detail: error.message,
        buttons: ["Retry", "Quit"],
        defaultId: 0,
        cancelId: 1,
      });
      if (result.response !== 0) {
        app.quit();
        return;
      }
    }
  }
}

function createWindow() {
  if (windowPromise) return windowPromise;
  windowPromise = createWindowLoop().finally(() => { windowPromise = undefined; });
  return windowPromise;
}

app.whenReady().then(() => {
  if (process.platform === "darwin") {
    app.dock.setIcon(app.isPackaged
      ? path.join(process.resourcesPath, "icons", "dock.png")
      : path.join(__dirname, "../electron-icon-pack/assets/png/icon.png"));
  }
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  return createWindow();
}).catch(error => {
  console.error("Failed to initialize BigTree:", error.stack || error);
  void dialog.showErrorBox("Unable to start BigTree", error.message);
  app.quit();
});

app.on("window-all-closed", () => {
  void stopRendererServer().finally(() => {
    if (process.platform !== "darwin") app.quit();
  });
});

app.on("before-quit", () => { app.isQuitting = true; });

app.on("activate", () => {
  if (!mainWindow) void createWindow();
});
