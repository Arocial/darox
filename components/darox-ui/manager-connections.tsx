"use client";

import { useEffect, useState } from "react";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import {
  type ManagerConfig,
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

function ManagerForm({
  manager,
  onConnected,
}: {
  manager?: ManagerConfig;
  onConnected?: () => void;
}) {
  const saveManager = useBackendStore((state) => state.saveManager);
  const [name, setName] = useState(manager?.name || "");
  const [url, setUrl] = useState(manager?.url || "");
  const [token, setToken] = useState(manager?.token || "");
  const [rememberToken, setRememberToken] = useState(
    manager?.rememberToken || false,
  );
  const [showToken, setShowToken] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setName(manager?.name || "");
    setUrl(manager?.url || "");
    setToken(manager?.token || "");
    setRememberToken(manager?.rememberToken || false);
    setError("");
  }, [manager]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await saveManager({ id: manager?.id, name, url, token, rememberToken });
      onConnected?.();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Unable to connect to Manager.",
      );
    } finally {
      setSubmitting(false);
    }
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
        <span className="font-medium">Manager URL</span>
        <input
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="http://127.0.0.1:3145"
          autoCapitalize="none"
          autoCorrect="off"
          inputMode="url"
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">API token</span>
        <div className="relative">
          <input
            type={showToken ? "text" : "password"}
            autoCapitalize="none"
            autoCorrect="off"
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
            : manager
              ? "Save and connect"
              : "Add and connect"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function ManagerDialog({
  open,
  onOpenChange,
  backendId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  backendId?: string;
}) {
  const manager = useBackendStore((state) =>
    state.managers.find((item) => item.id === backendId),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{manager ? "Edit Manager" : "Add Manager"}</DialogTitle>
        </DialogHeader>
        <ManagerForm
          manager={manager}
          onConnected={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

export function ManagerConnectionPrompt() {
  return (
    <div className="flex h-full items-center justify-center overflow-y-auto bg-background p-4 text-foreground">
      <div className="w-full max-w-md rounded-lg border bg-card p-6 shadow-sm">
        <h1 className="mb-2 font-semibold text-xl">Connect to Arox Manager</h1>
        <p className="mb-5 text-muted-foreground text-sm">
          Add a Manager connection to view and manage its profiles.
        </p>
        <ManagerForm />
      </div>
    </div>
  );
}
