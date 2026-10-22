import type { MarkdownTextPrimitiveProps } from "@assistant-ui/react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";

const parser = unified().use(remarkParse).use(remarkGfm).use(remarkMath);
const bracketMath =
  /(?<!\\)\\{1,2}(?:\[([\s\S]+?)\\{1,2}\]|\(([^\n]+?)\\{1,2}\))/g;

const rewriteBrackets = (text: string) =>
  text.replace(bracketMath, (_, display: string | undefined, inline: string) =>
    display === undefined
      ? `$${inline.trim()}$`
      : `\n\n$$\n${display.trim()}\n$$\n\n`,
  );

export function preprocessMath(text: string): string {
  if (!/\\[[(]/.test(text)) return text;

  const ranges: [number, number][] = [];
  visit(parser.parse(text), (node) => {
    if (
      !["code", "inlineCode", "math", "inlineMath", "html"].includes(node.type)
    )
      return;
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    if (start !== undefined && end !== undefined) ranges.push([start, end]);
  });

  let offset = 0;
  let result = "";
  for (const [start, end] of ranges) {
    result +=
      rewriteBrackets(text.slice(offset, start)) + text.slice(start, end);
    offset = end;
  }
  return result + rewriteBrackets(text.slice(offset));
}

export const remarkPlugins: NonNullable<
  MarkdownTextPrimitiveProps["remarkPlugins"]
> = [remarkGfm, remarkMath];

export const rehypePlugins: NonNullable<
  MarkdownTextPrimitiveProps["rehypePlugins"]
> = [[rehypeKatex, { trust: false, maxSize: 20, maxExpand: 1000 }]];
