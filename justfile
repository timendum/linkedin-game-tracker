DIST_DIR := "dist"

default: help

# list available recipes
help:
  @just --list --unsorted

# bundle the extension into dist/
build:
  @echo "==> build"
  deno run --allow-read --allow-write --allow-env --allow-run build.ts

# type-check all TypeScript sources
check:
  @echo "==> typecheck"
  deno check src/**/*.ts

# run tests
test *ARGS:
  @echo "==> test"
  deno test --allow-read --allow-write {{ARGS}}

# format sources (deno fmt, line width 100)
fmt *ARGS:
  @echo "==> format"
  deno fmt {{ARGS}}

# verify formatting without writing changes
fmt-check:
  @echo "==> format check"
  deno fmt --check

# run all quality gates: typecheck + test + format check
ci: check test fmt-check

# removes build outputs
clean:
  @echo "==> clean"
  rm -rf {{DIST_DIR}}
