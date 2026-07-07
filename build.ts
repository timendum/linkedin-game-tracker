import * as esbuild from "esbuild";
import { denoPlugins } from "@luca/esbuild-deno-loader";
import { copy } from "@std/fs/copy";
import { ensureDir } from "@std/fs/ensure-dir";
import { resolve } from "@std/path";

const entryPoints = [
  { in: "src/popup/main.tsx", out: "popup/main" },
  { in: "src/content/game-scraper.ts", out: "content/game-scraper" },
  { in: "src/content/result-scraper.ts", out: "content/result-scraper" },
  { in: "src/background/service-worker.ts", out: "background/service-worker" },
];

async function build() {
  // Ensure dist directory exists
  await ensureDir("dist");

  // Bundle TypeScript entry points with JSX support for Preact
  // Uses deno-esbuild-loader to resolve Deno import maps (npm: specifiers)
  await esbuild.build({
    entryPoints: entryPoints.map((ep) => ({ in: ep.in, out: ep.out })),
    bundle: true,
    outdir: "dist",
    format: "esm",
    target: "es2022",
    minify: false,
    sourcemap: false,
    jsx: "automatic",
    jsxImportSource: "preact",
    plugins: [...denoPlugins({ configPath: resolve("deno.json") })],
  });

  // Copy static assets to dist
  await ensureDir("dist/popup");
  try {
    await copy("src/popup/index.html", "dist/popup/index.html", {
      overwrite: true,
    });
  } catch {
    // index.html may not exist yet during initial scaffold
  }
  try {
    await copy("src/popup/styles.css", "dist/popup/styles.css", {
      overwrite: true,
    });
  } catch {
    // styles.css may not exist yet during initial scaffold
  }

  // Copy manifest.json to dist
  try {
    await copy("manifest.json", "dist/manifest.json", { overwrite: true });
  } catch {
    // manifest.json may not exist yet
  }

  esbuild.stop();
  const distPath = resolve("dist");
  console.log(`Build complete → ${distPath}`);
}

build().catch((err) => {
  console.error("Build failed:", err);
  Deno.exit(1);
});
