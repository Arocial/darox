"use client";

import { useState, useEffect } from "react";
import { useBackendStore } from "@/components/darox-ui/backend-store";
import { Button } from "@/components/ui/button";

export function BrowserApiPrompt() {
  const { apiBase, setApiBase, status } = useBackendStore();
  const [inputUrl, setInputUrl] = useState("");

  useEffect(() => {
    const savedUrl = localStorage.getItem("darox_api_base");
    if (savedUrl) {
      setApiBase(savedUrl);
      setInputUrl(savedUrl);
    }
  }, [setApiBase]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    let url = inputUrl.trim();
    if (!url) return;
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = `http://${url}`;
    }
    localStorage.setItem("darox_api_base", url);
    setApiBase(url);
  };

  if (status === "connected") return null;

  return (
    <div className="flex h-dvh items-center justify-center bg-background text-foreground">
      <div className="w-full max-w-md rounded-lg border bg-card p-6 shadow-sm">
        <h2 className="mb-4 font-semibold text-xl">Connect to Backend</h2>
        <p className="mb-4 text-muted-foreground text-sm">
          You are running Darox in a browser. Please enter the URL of your Darox
          backend API.
        </p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="text"
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            placeholder="e.g., http://localhost:8000"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:font-medium file:text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          />
          <Button type="submit" disabled={status === "connecting"}>
            {status === "connecting" ? "Connecting..." : "Connect"}
          </Button>
        </form>
        {status === "disconnected" && apiBase && !apiBase.endsWith(":0") && (
          <p className="mt-4 text-destructive text-sm">
            Failed to connect to {apiBase}. Please check the URL and ensure the
            backend is running.
          </p>
        )}
      </div>
    </div>
  );
}
