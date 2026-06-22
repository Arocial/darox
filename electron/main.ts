import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  protocol,
  net,
  session,
  Menu,
  clipboard,
  screen,
} from "electron";
import path from "node:path";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { BackendManager } from "./backend";

const isDev = !!process.env.ELECTRON_DEV;
const mgr = new BackendManager();
let mainWindow: BrowserWindow | null = null;

interface WindowState {
  width: number;
  height: number;
  x?: number;
  y?: number;
  isMaximized?: boolean;
}

const DEFAULT_WIDTH = 800;
const DEFAULT_HEIGHT = 600;
let saveTimeout: NodeJS.Timeout | null = null;

function getWindowStatePath(): string {
  return path.join(app.getPath("userData"), "window-state.json");
}

function loadWindowState(): WindowState {
  try {
    const filePath = getWindowStatePath();
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, "utf-8");
      return JSON.parse(data);
    }
  } catch (e) {
    console.error("Failed to load window state:", e);
  }
  return { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT };
}

function saveWindowState(state: WindowState) {
  try {
    const filePath = getWindowStatePath();
    fs.writeFileSync(filePath, JSON.stringify(state), "utf-8");
  } catch (e) {
    console.error("Failed to save window state:", e);
  }
}

function saveWindowStateDebounced(state: WindowState) {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    saveWindowState(state);
  }, 500);
}

/** Read current bounds + maximized flag from a window. When maximized the
 *  previous (restored) geometry is preserved so un-maximising restores it. */
function captureWindowState(win: BrowserWindow): WindowState {
  if (win.isMaximized()) {
    return { ...loadWindowState(), isMaximized: true };
  }
  const bounds = win.getBounds();
  return {
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    isMaximized: false,
  };
}

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
  const state = loadWindowState();

  const savedX = state.x;
  const savedY = state.y;
  let x = savedX;
  let y = savedY;
  if (savedX !== undefined && savedY !== undefined) {
    const visible = screen.getAllDisplays().some((display) => {
      const bounds = display.bounds;
      return (
        savedX >= bounds.x &&
        savedY >= bounds.y &&
        savedX < bounds.x + bounds.width &&
        savedY < bounds.y + bounds.height
      );
    });
    if (!visible) {
      x = undefined;
      y = undefined;
    }
  }

  mainWindow = new BrowserWindow({
    title: "darox",
    icon: path.join(__dirname, "..", "..", "resources", "icon.png"),
    width: state.width,
    height: state.height,
    x,
    y,
    resizable: true,
    fullscreen: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (state.isMaximized) {
    mainWindow.maximize();
  }

  mainWindow.setMenuBarVisibility(false);
  mgr.attach(mainWindow);

  const saveState = () => {
    if (!mainWindow) return;
    try {
      saveWindowStateDebounced(captureWindowState(mainWindow));
    } catch (e) {
      console.error("Failed to save window state:", e);
    }
  };

  mainWindow.on("resize", saveState);
  mainWindow.on("move", saveState);
  mainWindow.on("close", () => {
    if (saveTimeout) {
      clearTimeout(saveTimeout);
    }
    if (!mainWindow) return;
    try {
      saveWindowState(captureWindowState(mainWindow));
    } catch (e) {
      console.error("Failed to save window state on close:", e);
    }
  });

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
    const outDir = resolveOutDir();
    const filePath = path.resolve(outDir, pathname.replace(/^\//, ""));
    // Prevent path traversal — resolved path must stay inside the out/ dir.
    if (!filePath.startsWith(outDir + path.sep) && filePath !== outDir) {
      return new Response("Forbidden", { status: 403 });
    }
    return net.fetch(pathToFileURL(filePath).toString());
  });

  // Content-Security-Policy: only allow same-origin resources and inline styles
  // (needed for Tailwind), plus WebSocket connections to the local backend.
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [
          "default-src 'self' app:;",
          "script-src 'self' app:;",
          "style-src 'self' app: 'unsafe-inline';",
          "img-src 'self' app: data: blob:;",
          "font-src 'self' app: data:;",
          "connect-src 'self' app: http://127.0.0.1:* ws://127.0.0.1:*;",
        ].join(" "),
      },
    });
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
    if (mainWindow) {
      saveWindowState(captureWindowState(mainWindow));
    }
  } catch (err) {
    console.error("Failed to save window state during quit:", err);
  }

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
