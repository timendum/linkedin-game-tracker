DIST_DIR := "dist"

default: help

# list available recipes
help:
  @just --list --unsorted

# bundle the extension into dist/
build:
  @echo "==> build"
  deno task build
  deno task build --target=firefox

# type-check all TypeScript sources
check:
  @echo "==> typecheck"
  deno task check

# run tests
test *ARGS:
  @echo "==> test"
  deno task test

# format sources (deno fmt, line width 100)
fmt *ARGS:
  @echo "==> format"
  deno fmt {{ARGS}}

# verify formatting without writing changes
fmt-check:
  @echo "==> format check"
  deno fmt --check

lint *ARGS:
  @echo "==> lint"
  deno lint {{ARGS}}
  deno task xlint {{ARGS}}

# run all quality gates: typecheck + test + format check
ci: check test fmt-check lint

# removes build outputs
clean:
  @echo "==> clean"
  rm -rf {{DIST_DIR}}
