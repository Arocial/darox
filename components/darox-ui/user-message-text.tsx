"use client";

import { useMessagePartText } from "@assistant-ui/react";
import { type FC, memo } from "react";

const UserMessageTextImpl: FC = () => {
  const { text } = useMessagePartText();

  if (!text) return null;

  return <p className="whitespace-pre-wrap">{text}</p>;
};

export const UserMessageText = memo(UserMessageTextImpl);
