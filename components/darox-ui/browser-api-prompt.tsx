"use client";

import { useEffect, useState } from "react";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import {
  type CustomBackendConfig,
  useBackendStore,
} from "@/components/darox-ui/backend-store";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function CustomBackendForm({
  backend,
  onConnected,
}: {
  backend?: CustomBackendConfig;
  onConnected?: () => void;
}) {
  const connect = useBackendStore((state) => state.connectCustomBackend);
  const [name, setName] = useState(backend?.name || "");
  const [url, setUrl] = useState(backend?.url || "");
  const [token, setToken] = useState(backend?.token || "");
  const [rememberToken, setRememberToken] = useState(
    backend?.rememberToken || false,
  );
  const [showToken, setShowToken] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setName(backend?.name || "");
    setUrl(backend?.url || "");
    setToken(backend?.token || "");
    setRememberToken(backend?.rememberToken || false);
    setError("");
  }, [backend]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    const connected = await connect({
      id: backend?.id,
      name,
      url,
      token,
      rememberToken,
    });
    setSubmitting(false);
    if (connected) onConnected?.();
    else
      setError(
        "Unable to connect. Check the URL, token, and backend CORS settings.",
      );
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">Name</span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Development"
          autoCapitalize="none"
          autoCorrect="off"
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">Backend URL</span>
        <input
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="http://localhost:8000"
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">API token</span>
        <div className="relative">
          <input
            type={showToken ? "text" : "password"}
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder="Optional"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 pr-10 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <button
            type="button"
            onClick={() => setShowToken((value) => !value)}
            className="absolute inset-y-0 right-0 px-3 text-muted-foreground hover:text-foreground"
            aria-label={showToken ? "Hide API token" : "Show API token"}
          >
            {showToken ? (
              <EyeOffIcon className="size-4" />
            ) : (
              <EyeIcon className="size-4" />
            )}
          </button>
        </div>
      </label>
      <label className="flex items-center gap-2 text-muted-foreground text-sm">
        <input
          type="checkbox"
          checked={rememberToken}
          onChange={(event) => setRememberToken(event.target.checked)}
          className="size-4"
        />
        Remember token on this device
      </label>
      {error && <p className="text-destructive text-sm">{error}</p>}
      <DialogFooter>
        <Button type="submit" disabled={!url.trim() || submitting}>
          {submitting
            ? "Connecting…"
            : backend
              ? "Save and connect"
              : "Add and connect"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function CustomBackendDialog({
  open,
  onOpenChange,
  backendId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  backendId?: string;
}) {
  const backend = useBackendStore((state) =>
    state.customBackends.find((item) => item.id === backendId),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {backend ? "Edit Custom Backend" : "Add Custom Backend"}
          </DialogTitle>
        </DialogHeader>
        <CustomBackendForm
          backend={backend}
          onConnected={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

export function BrowserApiPrompt() {
  const customBackends = useBackendStore((state) => state.customBackends);
  const selectCustomBackend = useBackendStore(
    (state) => state.selectCustomBackend,
  );
  const [editingId, setEditingId] = useState<string>();
  const [connectingId, setConnectingId] = useState<string>();
  const [error, setError] = useState("");
  const editingBackend = customBackends.find(
    (backend) => backend.id === editingId,
  );

  const connect = async (id: string) => {
    setError("");
    setConnectingId(id);
    const connected = await selectCustomBackend(id);
    setConnectingId(undefined);
    if (!connected) {
      setError("Unable to connect to the selected backend.");
    }
  };

  return (
    <div className="flex h-dvh items-center justify-center bg-background p-4 text-foreground">
      <div className="w-full max-w-md rounded-lg border bg-card p-6 shadow-sm">
        <h2 className="mb-2 font-semibold text-xl">Connect to Backend</h2>
        <p className="mb-5 text-muted-foreground text-sm">
          Select a saved backend or add another Darox backend.
        </p>
        {customBackends.length > 0 && (
          <div className="mb-5 space-y-2">
            {customBackends.map((backend) => (
              <div
                key={backend.id}
                className="flex min-w-0 items-center gap-2 rounded-md border p-2"
              >
                <button
                  type="button"
                  disabled={Boolean(connectingId)}
                  onClick={() => void connect(backend.id)}
                  className="min-w-0 flex-1 text-left disabled:opacity-50"
                >
                  <span className="block truncate font-medium text-sm">
                    {backend.name}
                  </span>
                  <span className="block truncate text-muted-foreground text-xs">
                    {backend.url}
                  </span>
                </button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditingId(backend.id)}
                >
                  Edit
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={Boolean(connectingId)}
                  onClick={() => void connect(backend.id)}
                >
                  {connectingId === backend.id ? "Connecting…" : "Connect"}
                </Button>
              </div>
            ))}
            {error && <p className="text-destructive text-sm">{error}</p>}
          </div>
        )}
        <div className="mb-4 flex items-center justify-between border-t pt-4">
          <h3 className="font-medium text-sm">
            {editingBackend ? "Edit backend" : "Add backend"}
          </h3>
          {editingBackend && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setEditingId(undefined)}
            >
              Add new
            </Button>
          )}
        </div>
        <CustomBackendForm backend={editingBackend} />
      </div>
    </div>
  );
}
