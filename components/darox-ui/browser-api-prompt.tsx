"use client";

import { useEffect, useState } from "react";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { useBackendStore } from "@/components/darox-ui/backend-store";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function CustomBackendForm({ onConnected }: { onConnected?: () => void }) {
  const customBackend = useBackendStore((state) => state.customBackend);
  const connect = useBackendStore((state) => state.connectCustomBackend);
  const [url, setUrl] = useState(customBackend?.url || "");
  const [token, setToken] = useState(customBackend?.token || "");
  const [rememberToken, setRememberToken] = useState(
    customBackend?.rememberToken || false,
  );
  const [showToken, setShowToken] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setUrl(customBackend?.url || "");
    setToken(customBackend?.token || "");
    setRememberToken(customBackend?.rememberToken || false);
  }, [customBackend]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    const connected = await connect({ url, token, rememberToken });
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
          {submitting ? "Connecting…" : "Connect"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function CustomBackendDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Custom Backend</DialogTitle>
        </DialogHeader>
        <CustomBackendForm onConnected={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

export function BrowserApiPrompt() {
  return (
    <div className="flex h-dvh items-center justify-center bg-background p-4 text-foreground">
      <div className="w-full max-w-md rounded-lg border bg-card p-6 shadow-sm">
        <h2 className="mb-2 font-semibold text-xl">Connect to Backend</h2>
        <p className="mb-5 text-muted-foreground text-sm">
          Enter the URL and API token for your Darox backend.
        </p>
        <CustomBackendForm />
      </div>
    </div>
  );
}
