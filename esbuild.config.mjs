import { build } from "esbuild";

// Build main action entry point
await build({
  entryPoints: ["dist/main.js"],
  bundle: true,
  platform: "node",
  target: "node24",
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
  target: "node24",
  format: "cjs",
  outfile: "dist/cli.cjs",
  external: [],
  sourcemap: true,
  sourcesContent: false,
  banner: {
    js: "#!/usr/bin/env node",
  },
});

console.log("Build complete: dist/index.cjs, dist/cli.cjs");