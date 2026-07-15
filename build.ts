import * as esbuild from "esbuild";
import { denoPlugins } from "@luca/esbuild-deno-loader";
import { copy } from "@std/fs/copy";
import { ensureDir } from "@std/fs/ensure-dir";
import { resolve } from "@std/path";

const entryPoints = [
  { in: "src/popup/main.tsx", out: "popup/main" },
  { in: "src/chart/main.tsx", out: "chart/main" },
  { in: "src/compare/main.tsx", out: "compare/main" },
  { in: "src/content/game-scraper.ts", out: "content/game-scraper" },
  { in: "src/content/result-scraper.ts", out: "content/result-scraper" },
  { in: "src/background/service-worker.ts", out: "background/service-worker" },
];

/** Recursively compute total byte size of a directory. */
async function dirSize(path: string): Promise<number> {
  let total = 0;
  for await (const entry of Deno.readDir(path)) {
    const fullPath = `${path}/${entry.name}`;
    if (entry.isFile) {
      const info = await Deno.stat(fullPath);
      total += info.size;
    } else if (entry.isDirectory) {
      total += await dirSize(fullPath);
    }
  }
  return total;
}

async function build() {
  // Clean dist directory
  try {
    await Deno.remove("dist", { recursive: true });
  } catch (err) {
    if (!(err instanceof Deno.errors.NotFound)) throw err;
  }

  // Ensure dist directory exists
  await ensureDir("dist");

  // Bundle TypeScript entry points with JSX support for Preact
  // Uses deno-esbuild-loader to resolve Deno import maps (npm: specifiers)
  await esbuild.build({
    entryPoints: entryPoints.map((ep) => ({ in: ep.in, out: ep.out })),
    bundle: true,
    outdir: "dist",
    format: "esm",
    target: "es2023",
    minify: false,
    sourcemap: false,
    jsx: "automatic",
    jsxImportSource: "preact",
    plugins: [...denoPlugins({ configPath: resolve("deno.json") })],
  });

  // Copy static assets to dist
  await ensureDir("dist/popup");
  await ensureDir("dist/shared");
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
  try {
    await copy("src/shared/base.css", "dist/shared/base.css", {
      overwrite: true,
    });
  } catch {
    // base.css may not exist yet during initial scaffold
  }

  // Copy chart static assets to dist
  await ensureDir("dist/chart");
  try {
    await copy("src/chart/index.html", "dist/chart/index.html", {
      overwrite: true,
    });
  } catch {
    // index.html may not exist yet during initial scaffold
  }
  try {
    await copy("src/chart/styles.css", "dist/chart/styles.css", {
      overwrite: true,
    });
  } catch {
    // styles.css may not exist yet during initial scaffold
  }

  // Copy compare static assets to dist
  await ensureDir("dist/compare");
  try {
    await copy("src/compare/index.html", "dist/compare/index.html", {
      overwrite: true,
    });
  } catch {
    // index.html may not exist yet during initial scaffold
  }
  try {
    await copy("src/compare/styles.css", "dist/compare/styles.css", {
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

  // Report sizes
  const distPath = resolve("dist");
  const totalBytes = await dirSize(distPath);
  const kb = (totalBytes / 1024).toFixed(1);
  console.log(`Build complete → ${distPath}`);
  console.log(`  Size: ${kb} KB`);
}

build().catch((err) => {
  console.error("Build failed:", err);
  Deno.exit(1);
});
