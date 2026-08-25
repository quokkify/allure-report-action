import { build } from "esbuild";
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Build main action entry point
await build({
  entryPoints: ["dist/main.js"],
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  outfile: "dist/index.cjs",
  external: [],
  sourcemap: true,
  sourcesContent: false,
  banner: {
    js: "#!/usr/bin/env node",
  },
});

// Build CLI entry point
await build({
  entryPoints: ["dist/cli.js"],
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  outfile: "dist/cli.cjs",
  external: [],
  sourcemap: true,
  sourcesContent: false,
  banner: {
    js: "#!/usr/bin/env node",
  },
});

// Copy action.yml to dist
if (existsSync("action.yml")) {
  copyFileSync("action.yml", "dist/action.yml");
}

// Copy version.txt to dist
if (existsSync("version.txt")) {
  copyFileSync("version.txt", "dist/version.txt");
}

console.log("Build complete: dist/index.cjs, dist/cli.cjs");