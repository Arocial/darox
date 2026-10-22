import type { MarkdownTextPrimitiveProps } from "@assistant-ui/react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

export const remarkPlugins: NonNullable<
  MarkdownTextPrimitiveProps["remarkPlugins"]
> = [remarkGfm, remarkMath];

export const rehypePlugins: NonNullable<
  MarkdownTextPrimitiveProps["rehypePlugins"]
> = [[rehypeKatex, { trust: false, maxSize: 20, maxExpand: 1000 }]];
