"use client";

import { useEffect, type FC } from "react";
import { useAui, useAuiState } from "@assistant-ui/react";

export const ComposerJsonUnwrapper: FC = () => {
  const aui = useAui();
  const text = useAuiState((s) => s.composer.text);

  useEffect(() => {
    if (text.startsWith("{") && text.endsWith("}")) {
      try {
        const parsed = JSON.parse(text);
        if (
          parsed &&
          typeof parsed === "object" &&
          parsed.normal_input &&
          typeof parsed.normal_input.user_input === "string"
        ) {
          aui.composer().setText(parsed.normal_input.user_input);
        }
      } catch {
        // Not valid JSON or doesn't match our schema, ignore
      }
    }
  }, [text, aui]);

  return null;
};
