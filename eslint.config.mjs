import { FlatCompat } from "@eslint/eslintrc";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const compat = new FlatCompat({
    baseDirectory: __dirname,
});

const config = [
    {
        ignores: [".next/**", "node_modules/**", "dist/**", "build/**", "out/**", "src-tauri/**", "next-env.d.ts", "tailwind.config.js"],
    },
    ...compat.extends("next/core-web-vitals", "next/typescript"),
];

export default config;