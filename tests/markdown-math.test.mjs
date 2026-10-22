import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import {
  preprocessMath,
  rehypePlugins,
  remarkPlugins,
} from "../components/darox-ui/markdown-plugins.ts";

const render = (children) =>
  renderToStaticMarkup(
    createElement(
      ReactMarkdown,
      { remarkPlugins, rehypePlugins },
      preprocessMath(children),
    ),
  );

test("renders inline and block math with KaTeX", () => {
  const inline = render("Energy: $E = mc^2$ and $$a^2 + b^2 = c^2$$.");
  assert.equal((inline.match(/class="katex"/g) ?? []).length, 2);
  assert.doesNotMatch(inline, /katex-display/);

  const block = render("$$\n\\int_0^\\infty e^{-x}\\,dx = 1\n$$");
  assert.match(block, /class="katex-display"/);
  assert.match(block, /<math[^>]+display="block"/);
});

test("preserves dollar delimiters inside code and escaped currency", () => {
  const html = render("`$x$`\n\n```text\n$$x$$\n```\n\nPrice: \\$5 and \\$10.");
  assert.match(html, /<code>\$x\$<\/code>/);
  assert.match(html, /<code class="language-text">\$\$x\$\$/);
  assert.match(html, /Price: \$5 and \$10/);
  assert.doesNotMatch(html, /class="katex"/);
});

test("retains GFM tables and renders math in cells", () => {
  const html = render("| Formula |\n| --- |\n| $x^2$ |");
  assert.match(html, /<table>/);
  assert.match(html, /<td><span class="katex"/);
});

test("handles incomplete streaming math and invalid LaTeX without throwing", () => {
  assert.doesNotThrow(() => render("Streaming $x^"));
  assert.doesNotThrow(() => render("$$\n\\frac{1}{"));
  const invalid = render("$\\invalidcommand{x}$");
  assert.match(invalid, /\\invalidcommand/);
  assert.match(invalid, /color:#cc0000/);
});

test("does not trust links or unbounded size commands in math", () => {
  assert.doesNotMatch(
    render("$\\href{https://example.com}{click}$"),
    /href="https:\/\/example.com"/,
  );
  const oversized = render("$\\rule{1000em}{1000em}$");
  assert.match(oversized, /border-right-width:20em/);
  assert.doesNotMatch(oversized, /(?:width|height)[=:]"?1000em/);
});

test("renders LaTeX bracket delimiters as display and inline math", () => {
  for (const text of [
    String.raw`\[x^2 + y^2 = z^2\]`,
    "\\[\n\\frac{1}{2}\n\\]",
    String.raw`Before \[x^2\] after.`,
    String.raw`\\[x^2\\]`,
  ]) {
    assert.match(render(text), /class="katex-display"/);
  }
  const inline = render(String.raw`Energy: \(E = mc^2\).`);
  assert.match(inline, /class="katex"/);
  assert.doesNotMatch(inline, /katex-display/);
});

test("does not rewrite bracket delimiters in code or existing math", () => {
  for (const text of [
    "Code: `\\[x\\]` and `\\(y\\)`.",
    "```latex\n\\[x\\]\n```",
    "~~~latex\n\\(x\\)\n~~~",
    "    \\[x\\]",
    "```latex\n\\[x\\]",
    String.raw`$\text{\(x\)}$`,
    String.raw`$$
\begin{matrix}a\\[2pt]b\end{matrix}
$$`,
  ]) {
    assert.equal(preprocessMath(text), text);
  }
});

test("keeps incomplete brackets unchanged until streaming closes them", () => {
  const incomplete = String.raw`Before \[\frac{1}{2}`;
  assert.equal(preprocessMath(incomplete), incomplete);
  assert.match(render(`${incomplete}\\]`), /class="katex-display"/);
  assert.equal(preprocessMath(String.raw`Before \(x`), String.raw`Before \(x`);
});
