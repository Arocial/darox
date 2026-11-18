import type {
  BrowserWindow,
  IpcMain,
  IpcMainInvokeEvent,
  Notification,
} from "electron";

export interface TurnNotificationTarget {
  managerId: string;
  profileId: string;
  startedAt: string | null;
  sessionPath: string;
}

export interface TurnNotificationInput {
  title: string;
  body: string;
  target: TurnNotificationTarget | null;
}

type NotificationWindow = Pick<
  BrowserWindow,
  "isDestroyed" | "isMinimized" | "restore" | "show" | "focus" | "webContents"
>;
type NativeNotification = Pick<Notification, "show" | "close" | "once">;

interface TurnNotificationOptions {
  ipcMain: Pick<IpcMain, "handle">;
  appUrl: string;
  getWindow: () => NotificationWindow | null;
  recreateWindow?: () => NotificationWindow | null;
  focusApp?: () => void;
  isSupported: () => boolean;
  createNotification: (
    text: Pick<TurnNotificationInput, "title" | "body">,
  ) => NativeNotification;
}

const MAX_NATIVE_NOTIFICATIONS = 64;
const NATIVE_SHOW_TIMEOUT_MS = 5_000;

function isString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length <= maxLength;
}

function isTarget(value: unknown): value is TurnNotificationTarget {
  if (!value || typeof value !== "object") return false;
  const target = value as Partial<TurnNotificationTarget>;
  return (
    isString(target.managerId, 16384) &&
    isString(target.profileId, 16384) &&
    (target.startedAt === null || isString(target.startedAt, 16384)) &&
    isString(target.sessionPath, 16384)
  );
}

function isInput(value: unknown): value is TurnNotificationInput {
  if (!value || typeof value !== "object") return false;
  const input = value as Partial<TurnNotificationInput>;
  return (
    isString(input.title, 1024) &&
    isString(input.body, 4096) &&
    (input.target === null || isTarget(input.target))
  );
}

export function registerTurnNotifications(options: TurnNotificationOptions) {
  const appUrl = new URL(options.appUrl);
  const active = new Map<NativeNotification, () => void>();
  let pendingTarget: TurnNotificationTarget | null = null;

  function isMainFrame({ sender, senderFrame }: IpcMainInvokeEvent) {
    const win = options.getWindow();
    if (
      !win ||
      win.isDestroyed() ||
      sender !== win.webContents ||
      !senderFrame ||
      senderFrame !== sender.mainFrame
    ) {
      return false;
    }
    try {
      const url = new URL(senderFrame.url);
      return (
        url.protocol === appUrl.protocol &&
        url.host === appUrl.host &&
        !url.username &&
        !url.password
      );
    } catch {
      return false;
    }
  }

  function activate(target: TurnNotificationTarget | null) {
    // The renderer pulls on mount as well as on a signal. Keep the latest
    // target in main even if the window is closed, loading, or reloading.
    pendingTarget = target;
    let win = options.getWindow();
    if (!win || win.isDestroyed()) win = options.recreateWindow?.() ?? null;
    if (!win || win.isDestroyed()) return;
    if (win.isMinimized()) win.restore();
    win.show();
    options.focusApp?.();
    win.focus();
    win.webContents.send("notification:turn-click");
  }

  async function show(input: TurnNotificationInput): Promise<boolean> {
    let notification: NativeNotification;
    try {
      if (!options.isSupported()) return false;
      notification = options.createNotification({
        title: input.title,
        body: input.body,
      });
    } catch {
      return false;
    }
    return new Promise((resolve) => {
      const settle = (shown: boolean) => {
        clearTimeout(timer);
        resolve(shown);
      };
      const discard = () => {
        if (!active.delete(notification)) return;
        settle(false);
        // A request without acknowledgement must not leave a second toast
        // behind after the renderer is told to try its browser fallback.
        try {
          notification.close();
        } catch {
          // The OS may have already removed it.
        }
      };
      const timer = setTimeout(discard, NATIVE_SHOW_TIMEOUT_MS);
      timer.unref();
      if (active.size >= MAX_NATIVE_NOTIFICATIONS) {
        active.values().next().value?.();
      }
      active.set(notification, discard);
      notification.once("show", () => settle(true));
      notification.once("failed", () => {
        active.delete(notification);
        settle(false);
      });
      notification.once("close", (event) => {
        // On Windows the expired banner can still be clicked in Action Center.
        if (event.reason === "timedOut") return;
        active.delete(notification);
        settle(false);
      });
      notification.once("click", () => {
        if (!active.delete(notification)) return;
        settle(true);
        activate(input.target);
      });
      try {
        notification.show();
      } catch {
        discard();
      }
    });
  }

  options.ipcMain.handle("notification:show-turn", (event, input: unknown) =>
    isMainFrame(event) && isInput(input) ? show(input) : false,
  );
  options.ipcMain.handle("notification:take-turn-target", (event) => {
    if (!isMainFrame(event)) return null;
    const target = pendingTarget;
    pendingTarget = null;
    return target;
  });
}
