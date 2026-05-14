#!/usr/bin/env node
// Generate all icon assets from a single high-res source PNG.
// Usage: node scripts/generate-icons.mjs <source.png>
//        npm run icons -- <source.png>

import sharp from "sharp";
import png2icons from "png2icons";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const resources = path.join(root, "resources");
const appDir = path.join(root, "app");

const input = process.argv[2];
if (!input) {
  console.error("Usage: node scripts/generate-icons.mjs <source.png>");
  process.exit(1);
}

const srcBuf = await fs.readFile(path.resolve(input));
const meta = await sharp(srcBuf).metadata();
if (!meta.width || !meta.height || meta.width < 512 || meta.height < 512) {
  console.warn(
    `[warn] source is ${meta.width}x${meta.height}; recommend >= 1024x1024`,
  );
}

const resize = (size) =>
  sharp(srcBuf)
    .resize(size, size, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

const write = async (p, buf) => {
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, buf);
  console.log("wrote", path.relative(root, p));
};

const png1024 = await resize(1024);
const png512 = await resize(512);

// Linux / generic
await write(path.join(resources, "icon.png"), png512);
await write(path.join(resources, "32x32.png"), await resize(32));
await write(path.join(resources, "128x128.png"), await resize(128));
await write(path.join(resources, "128x128@2x.png"), await resize(256));

// Windows Store tiles
const tiles = {
  "Square30x30Logo.png": 30,
  "Square44x44Logo.png": 44,
  "Square71x71Logo.png": 71,
  "Square89x89Logo.png": 89,
  "Square107x107Logo.png": 107,
  "Square142x142Logo.png": 142,
  "Square150x150Logo.png": 150,
  "Square284x284Logo.png": 284,
  "Square310x310Logo.png": 310,
  "StoreLogo.png": 50,
};
for (const [name, size] of Object.entries(tiles)) {
  await write(path.join(resources, name), await resize(size));
}

// Windows .ico (multi-resolution)
const ico = png2icons.createICO(png1024, png2icons.BILINEAR, 0, false);
if (!ico) throw new Error("Failed to create ICO");
await write(path.join(resources, "icon.ico"), ico);
await write(path.join(appDir, "favicon.ico"), ico);

// macOS .icns (multi-resolution)
const icns = png2icons.createICNS(png1024, png2icons.BILINEAR, 0);
if (!icns) throw new Error("Failed to create ICNS");
await write(path.join(resources, "icon.icns"), icns);

console.log("\nDone.");
