import { cp, readFile, rm, stat } from "node:fs/promises";

const source = new URL("../.next-package/", import.meta.url);
const destination = new URL("../out/", import.meta.url);
const html = await readFile(new URL("index.html", source), "utf8");
if (!html.includes("/_next/static/"))
  throw new Error("Desktop static export is missing Next.js assets.");
await stat(new URL("_next/static/", source));
await rm(destination, { recursive: true, force: true });
await cp(source, destination, { recursive: true });
console.log("Desktop static export synchronized to out/.");
