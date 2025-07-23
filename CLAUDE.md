# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Core Commands

### Build
- `pnpm build` - Build all packages (except playgrounds)
- `pnpm build --filter=tailwindcss` - Build specific package
- `pnpm dev` - Development mode with watch for all packages

### Testing
- `pnpm test` - Run all tests (Rust + JavaScript)
- `pnpm test -- path/to/test.test.ts` - Run specific test file
- `pnpm tdd` - Test-driven development mode with Vitest watch
- `pnpm test:integrations` - Run integration tests
- `pnpm test:ui` - Run Playwright UI tests
- `cargo test` - Run Rust tests only

### Linting & Formatting
- `pnpm lint` - Check formatting and run linting
- `pnpm format` - Auto-format code with Prettier

## Architecture Overview

This is the Tailwind CSS v4 monorepo with a hybrid TypeScript/Rust architecture:

### Core Structure
- **Rust Oxide Engine** (`crates/oxide/`) - High-performance scanning and parsing of CSS candidates
- **TypeScript Packages** (`packages/`) - Various integrations and APIs
- **Integration Tests** (`integrations/`) - Test suites for different build tools

### Key Packages
- `packages/tailwindcss/` - Core v4 implementation that orchestrates the Rust engine
- `packages/@tailwindcss/oxide/` - Node.js bindings for the Rust scanner
- `packages/@tailwindcss/cli/` - Command-line interface
- `packages/@tailwindcss/postcss/` - PostCSS plugin integration
- `packages/@tailwindcss/vite/` - Vite plugin

### Important Concepts
1. **Candidate Extraction**: The Rust oxide engine scans source files for potential Tailwind classes
2. **AST-based CSS Generation**: CSS is generated through PostCSS AST manipulation
3. **Source Maps**: Full support for debugging generated CSS
4. **Multi-platform**: Native bindings for Darwin, Linux, Windows, and WASM

### Development Workflow
1. Changes to scanning/parsing logic → Edit Rust code in `crates/oxide/`
2. Changes to CSS generation → Edit TypeScript in `packages/tailwindcss/src/`
3. Adding new utilities → Update `packages/tailwindcss/src/utilities.ts`
4. Plugin development → Work in respective package directory

### Testing Approach
- Unit tests live alongside source files as `*.test.ts`
- Integration tests in `integrations/` directory
- Snapshot tests for CSS output validation
- Use `pnpm test -- --watch` for TDD workflow