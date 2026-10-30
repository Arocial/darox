import { createHash } from "node:crypto";

export function productionCsp(html = ""): string {
  const hashes = new Set<string>();
  for (const match of html.matchAll(
    /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi,
  )) {
    if (/\bsrc\s*=/i.test(match[1]) || !match[2]) continue;
    const source = match[2].replace(/\r\n?/g, "\n");
    hashes.add(
      `'sha256-${createHash("sha256").update(source).digest("base64")}'`,
    );
  }
  return [
    "default-src 'self' app:;",
    `script-src 'self' app: ${[...hashes].join(" ")};`,
    "style-src 'self' app: 'unsafe-inline';",
    "img-src 'self' app: data: blob:;",
    "font-src 'self' app: data:;",
    "connect-src 'self' app: http: https: ws: wss:;",
    "object-src 'none';",
    "base-uri 'self';",
    "frame-ancestors 'none';",
  ].join(" ");
}
