"use client";

import { useEffect, useState } from "react";
import { MenuIcon } from "lucide-react";
import { AgentTabBar } from "@/components/darox-ui/agent-tab-bar";
import { useAgentTabs } from "@/components/darox-ui/agent-store";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function AgentNavigation() {
  const [mobile, setMobile] = useState(false);
  const [open, setOpen] = useState(false);
  const activeId = useAgentTabs((state) => state.activeId);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => setMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    setOpen(false);
  }, [activeId]);
  if (!mobile) return <AgentTabBar />;
  return (
    <div className="flex shrink-0 items-center gap-2 border-b px-2 py-1">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Open sessions and settings"
          >
            <MenuIcon />
          </Button>
        </DialogTrigger>
        <DialogContent
          className="flex h-[85dvh] w-80 flex-col overflow-hidden p-0 pt-6"
          aria-describedby={undefined}
        >
          <DialogTitle className="px-4">Sessions and settings</DialogTitle>
          <div className="flex min-h-0 flex-1 overflow-hidden [&>div]:w-full">
            <AgentTabBar />
          </div>
        </DialogContent>
      </Dialog>
      <span className="font-medium text-sm">Darox</span>
    </div>
  );
}
