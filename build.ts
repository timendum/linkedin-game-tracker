import * as esbuild from "esbuild";
import { denoPlugins } from "@luca/esbuild-deno-loader";
import { copy } from "@std/fs/copy";
import { ensureDir } from "@std/fs/ensure-dir";
import { expandGlob } from "@std/fs/expand-glob";
import { dirname, resolve, join as joinPath } from "@std/path";


/** Target browser to build for. Set via --target=firefox argument. */
type BuildTarget = "chrome" | "firefox";

function parseBuildTarget(): BuildTarget {
  const targetArg = Deno.args.find((a) => a.startsWith("--target="));
  if (targetArg) {
    const value = targetArg.split("=")[1];
    if (value === "firefox") return "firefox";
  }
  return "chrome";
}

const entryPoints = [
  { in: "src/popup/main.tsx", out: "popup/main" },
  { in: "src/chart/main.tsx", out: "chart/main" },
  { in: "src/compare/main.tsx", out: "compare/main" },
  { in: "src/content/game-scraper.ts", out: "content/game-scraper" },
  { in: "src/content/result-scraper.ts", out: "content/result-scraper" },
  { in: "src/background/service-worker.ts", out: "background/service-worker" },
];

/** Glob patterns for static assets to copy into dist, preserving directory structure under src/. */
const staticAssets = [
  "src/popup/*.{html,css}",
  "src/chart/*.{html,css}",
  "src/compare/*.{html,css}",
  "src/shared/*.css",
  "icons/*.png",
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

/** Collect all entries from an async glob iterator into an array. */
async function collectGlob(pattern: string) {
  const entries = [];
  for await (const entry of expandGlob(pattern)) {
    if (entry.isFile) entries.push(entry);
  }
  return entries;
}

/** Copy static assets matching glob patterns into dist/. */
async function copyStaticAssets(outdir: string) {
  const cwd = Deno.cwd().replaceAll("\\", "/");

  const allEntries = (await Promise.all(staticAssets.map(collectGlob))).flat();

  await Promise.all(allEntries.map(async (entry) => {
    // Compute destination: strip leading "src/" prefix if present, keep the rest
    const relative = entry.path.replaceAll("\\", "/");
    const relPath = relative.startsWith(cwd) ? relative.slice(cwd.length + 1) : relative;
    const dest = relPath.startsWith("src/") ? relPath.slice("src/".length) : relPath;
    const destPath = joinPath(outdir, dest);

    await ensureDir(dirname(destPath));
    try {
      await copy(entry.path, destPath, { overwrite: true });
    } catch {
      // File may not exist yet during initial scaffold
    }
  }));
}

/**
 * Generate the manifest.json for the given target and write it to dist/.
 *
 * For Chrome: copies manifest.json as-is.
 * For Firefox: deep-merges manifest.firefox.json overrides into manifest.json.
 *   - Keys set to `null` in the override are removed from the output.
 *   - Objects are merged recursively; scalars/arrays are replaced.
 */
async function generateManifest(target: BuildTarget, outdir: string) {
  const baseText = await Deno.readTextFile("manifest.json");
  const base = JSON.parse(baseText);
  const manifestPaht = joinPath(outdir, "/manifest.json");

  if (target === "chrome") {
    await Deno.writeTextFile(manifestPaht, JSON.stringify(base, null, 2));
    return;
  }

  // Firefox: apply overrides
  const overridesText = await Deno.readTextFile("manifest.firefox.json");
  const overrides = JSON.parse(overridesText);
  const merged = applyOverrides(base, overrides);
  await Deno.writeTextFile(manifestPaht, JSON.stringify(merged, null, 2));
}

/**
 * Recursively apply overrides to a base object.
 * - null values delete the key from the result.
 * - Objects are merged recursively.
 * - All other values replace the base value.
 */
// deno-lint-ignore no-explicit-any
function applyOverrides(base: any, overrides: any): any {
  const result = { ...base };
  for (const key of Object.keys(overrides)) {
    const val = overrides[key];
    if (val === null) {
      delete result[key];
    } else if (
      typeof val === "object" && !Array.isArray(val) &&
      typeof result[key] === "object" && !Array.isArray(result[key])
    ) {
      result[key] = applyOverrides(result[key], val);
    } else {
      result[key] = val;
    }
  }
  return result;
}

async function build() {
  const target = parseBuildTarget();
  const outdir = joinPath("dist", target);

  // Clean dist directory
  try {
    await Deno.remove("dist", { recursive: true });
  } catch (err) {
    if (!(err instanceof Deno.errors.NotFound)) throw err;
  }

  // Ensure dist directory exists
  await ensureDir(outdir);

  // Bundle TypeScript entry points with JSX support for Preact
  // Uses deno-esbuild-loader to resolve Deno import maps (npm: specifiers)
  await esbuild.build({
    entryPoints: entryPoints.map((ep) => ({ in: ep.in, out: ep.out })),
    bundle: true,
    outdir,
    format: "esm",
    target: "es2023",
    minify: false,
    sourcemap: false,
    jsx: "automatic",
    jsxImportSource: "preact",
    plugins: [...denoPlugins({ configPath: resolve("deno.json") })],
  });

  // Copy static assets to dist
  await copyStaticAssets(outdir);

  // Generate the appropriate manifest for the target browser
  await generateManifest(target, outdir);

  esbuild.stop();

  // Report sizes
  const distPath = resolve(outdir);
  const totalBytes = await dirSize(distPath);
  const kb = (totalBytes / 1024).toFixed(1);
  console.log(`Build complete (${target}) → ${distPath}`);
  console.log(`  Size: ${kb} KB`);
}

build().catch((err) => {
  console.error("Build failed:", err);
  Deno.exit(1);
});
