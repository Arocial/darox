"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface LaunchSettings {
  command: string;
  commonArgs: string[];
  extraArgs: string[];
  host: string;
  port: number | "auto";
  startupTimeoutMs: number;
}

export function BackendLaunchSettingsDialog({
  profile,
  onOpenChange,
}: {
  profile: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [settings, setSettings] = useState<LaunchSettings | null>(null);
  const [value, setValue] = useState("[]");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setSettings(null);
    setError("");
    window.darox
      ?.getProfileLaunchSettings(profile)
      .then((result) => {
        setSettings(result);
        setValue(JSON.stringify(result.extraArgs, null, 2));
      })
      .catch((reason) => setError(String(reason)));
  }, [profile]);

  const save = async () => {
    if (!profile || !window.darox) return;
    let args: unknown;
    try {
      args = JSON.parse(value);
      if (
        !Array.isArray(args) ||
        !args.every((arg) => typeof arg === "string")
      ) {
        throw new Error("Extra arguments must be a JSON array of strings.");
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      return;
    }
    setSaving(true);
    setError("");
    try {
      const result = await window.darox.updateProfileArgs(profile, args);
      setSettings(result);
      toast.success(`Saved launch arguments for ${profile}`);
      onOpenChange(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSaving(false);
    }
  };

  let previewArgs = settings?.extraArgs ?? [];
  try {
    const parsed = JSON.parse(value);
    if (
      Array.isArray(parsed) &&
      parsed.every((arg) => typeof arg === "string")
    ) {
      previewArgs = parsed;
    }
  } catch {}

  const preview = settings
    ? [
        settings.command,
        ...settings.commonArgs,
        "--profile",
        profile ?? "",
        ...previewArgs,
        "--ui",
        "vercel_ai",
        "--host",
        settings.host,
        "--port",
        String(settings.port),
      ].join(" ")
    : "Loading…";

  return (
    <Dialog open={profile !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Launch settings: {profile}</DialogTitle>
          <DialogDescription>
            Extra arguments are stored in{" "}
            ~/.config/arox/profiles/chat/darox.json.
          </DialogDescription>
        </DialogHeader>
        <label className="grid gap-2 text-sm">
          Extra arguments (JSON array)
          <textarea
            value={value}
            onChange={(event) => setValue(event.target.value)}
            className="min-h-36 rounded-md border bg-background px-3 py-2 font-mono text-xs outline-none focus:ring-2 focus:ring-ring"
            spellCheck={false}
          />
        </label>
        <div className="grid gap-1 text-xs">
          <span className="font-medium">Command preview</span>
          <code className="max-h-24 overflow-auto rounded bg-muted p-2 text-muted-foreground">
            {preview}
          </code>
        </div>
        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-destructive text-xs">
            {error}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!settings || saving} onClick={save}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
