"use client";

import { useEffect, useRef, useState } from "react";
import { CheckIcon, CopyIcon } from "lucide-react";
import { toast } from "sonner";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";
import { copyTextToClipboard } from "@/lib/clipboard";

export function CopyTextButton({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const [isCopied, setIsCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await copyTextToClipboard(text);
      setIsCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setIsCopied(false), 3000);
    } catch {
      setIsCopied(false);
      toast.error("Failed to copy. Please select and copy the text manually.");
    }
  };

  return (
    <TooltipIconButton
      tooltip={isCopied ? "Copied" : "Copy"}
      className={className}
      disabled={!text}
      onClick={copy}
    >
      {isCopied ? (
        <CheckIcon className="zoom-in-50 fade-in animate-in duration-200 ease-out" />
      ) : (
        <CopyIcon className="zoom-in-75 fade-in animate-in duration-150" />
      )}
    </TooltipIconButton>
  );
}
