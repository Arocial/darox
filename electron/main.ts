import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  protocol,
  net,
  Menu,
  clipboard,
} from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { BackendManager } from "./backend";

const isDev = !!process.env.ELECTRON_DEV;
const mgr = new BackendManager();
let mainWindow: BrowserWindow | null = null;

// Register the custom protocol used to serve the static Next.js export in prod.
// Must be called before app.whenReady().
protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);

function resolveOutDir(): string {
  // In dev: project_root/electron/dist/main.js → ../../out
  // In packaged: resourcesPath/app.asar/electron/dist/main.js → ../../out
  return path.join(__dirname, "..", "..", "out");
}

function buildContextMenu(
  win: BrowserWindow,
  params: Electron.ContextMenuParams,
) {
  const { editFlags, isEditable, selectionText, linkURL } = params;
  const hasSelection = !!selectionText && selectionText.trim().length > 0;

  const template: Electron.MenuItemConstructorOptions[] = [];

  if (linkURL) {
    template.push(
      {
        label: "Copy Link",
        click: () => {
          clipboard.writeText(linkURL);
        },
      },
      { type: "separator" },
    );
  }

  if (isEditable) {
    template.push(
      { role: "undo", enabled: editFlags.canUndo },
      { role: "redo", enabled: editFlags.canRedo },
      { type: "separator" },
      { role: "cut", enabled: editFlags.canCut },
      { role: "copy", enabled: editFlags.canCopy },
      { role: "paste", enabled: editFlags.canPaste },
      { role: "selectAll", enabled: editFlags.canSelectAll },
    );
  } else if (hasSelection) {
    template.push({ role: "copy" });
  } else {
    template.push({ label: "Reload", click: () => win.webContents.reload() });
  }

  if (isDev) {
    template.push(
      { type: "separator" },
      {
        label: "Inspect Element",
        click: () => win.webContents.inspectElement(params.x, params.y),
      },
      { role: "toggleDevTools" },
    );
  }

  return Menu.buildFromTemplate(template);
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    title: "darox",
    icon: path.join(__dirname, "..", "..", "resources", "icon.png"),
    width: 800,
    height: 600,
    resizable: true,
    fullscreen: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.setMenuBarVisibility(false);
  mgr.attach(mainWindow);

  mainWindow.webContents.on("context-menu", (_e, params) => {
    if (!mainWindow) return;
    const menu = buildContextMenu(mainWindow, params);
    menu.popup({ window: mainWindow });
  });

  // Relay native find-in-page results (match count, active ordinal) to renderer.
  mainWindow.webContents.on("found-in-page", (_e, result) => {
    mainWindow?.webContents.send("found-in-page", result);
  });

  if (isDev) {
    await mainWindow.loadURL("http://localhost:3140");
  } else {
    await mainWindow.loadURL("app://darox/index.html");
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  // Hide the default application menu globally (also hides macOS-style menu on Linux/Windows).
  Menu.setApplicationMenu(null);

  protocol.handle("app", (request) => {
    const url = new URL(request.url);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === "/" || pathname === "") pathname = "/index.html";
    const filePath = path.join(resolveOutDir(), pathname);
    return net.fetch(pathToFileURL(filePath).toString());
  });

  ipcMain.handle("start_backend", () => mgr.start());
  ipcMain.handle("stop_backend", async () => {
    await mgr.stop();
  });
  ipcMain.handle("restart_backend", () => mgr.restart());
  ipcMain.handle("get_backend_status", () => mgr.getStatus());
  ipcMain.handle("dialog:open", async (_e, opts) => {
    if (!mainWindow) return { canceled: true, filePaths: [] };
    return dialog.showOpenDialog(mainWindow, opts ?? {});
  });
  ipcMain.handle(
    "find:start",
    (
      _e,
      args: {
        text: string;
        forward?: boolean;
        findNext?: boolean;
        matchCase?: boolean;
      },
    ) => {
      if (!mainWindow || !args?.text) return null;
      return mainWindow.webContents.findInPage(args.text, {
        forward: args.forward ?? true,
        findNext: args.findNext ?? false,
        matchCase: args.matchCase ?? false,
      });
    },
  );
  ipcMain.handle(
    "find:stop",
    (_e, action?: "clearSelection" | "keepSelection" | "activateSelection") => {
      mainWindow?.webContents.stopFindInPage(action ?? "clearSelection");
    },
  );

  await createWindow();

  // Auto-start backend on launch
  try {
    const port = await mgr.start();
    console.log(`[main] backend auto-started on port ${port}`);
  } catch (e) {
    console.error("[main] failed to auto-start backend:", e);
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

let quitting = false;
app.on("before-quit", async (e) => {
  if (quitting) return;
  e.preventDefault();
  quitting = true;
  try {
    await mgr.stop();
  } finally {
    app.exit(0);
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
