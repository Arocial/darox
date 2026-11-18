import { useBackendStore } from "@/components/darox-ui/backend-store";

const refreshes = new Map<string, Promise<void>>();

export function refreshManager(managerId: string): Promise<void> {
  const existing = refreshes.get(managerId);
  if (existing) return existing;
  const request = useBackendStore.getState().refreshManager(managerId);
  refreshes.set(managerId, request);
  void request.finally(() => {
    if (refreshes.get(managerId) === request) refreshes.delete(managerId);
  });
  return request;
}

export async function refreshActiveBackend(): Promise<boolean> {
  const before = useBackendStore.getState();
  if (!before.activeManagerId) return false;
  await refreshManager(before.activeManagerId);
  const after = useBackendStore.getState();
  return (
    after.status === "connected" &&
    after.activeBackendId === before.activeBackendId &&
    after.connectionRevision === before.connectionRevision
  );
}

export function monitorManager(managerId: string): () => void {
  let disposed = false;
  let refreshing = false;
  let timer: ReturnType<typeof setTimeout>;

  const refresh = async () => {
    if (disposed || refreshing) return;
    clearTimeout(timer);
    if (!document.hidden && navigator.onLine) {
      refreshing = true;
      try {
        await refreshManager(managerId);
      } finally {
        refreshing = false;
      }
    }
    if (!disposed) timer = setTimeout(() => void refresh(), 3000);
  };
  const foreground = () => {
    if (!document.hidden) void refresh();
  };
  const online = () => void refresh();
  timer = setTimeout(() => void refresh(), 3000);
  document.addEventListener("visibilitychange", foreground);
  window.addEventListener("online", online);
  return () => {
    disposed = true;
    clearTimeout(timer);
    document.removeEventListener("visibilitychange", foreground);
    window.removeEventListener("online", online);
  };
}
