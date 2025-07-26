# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

twlint is a linter for Tailwind CSS v4 that validates CSS classes in codebases. It identifies invalid/non-existent Tailwind classes and provides detailed error reporting.

## Essential Commands

- **Install dependencies**: `npm install`
- **Build**: `npm run build` - Compiles TypeScript to JavaScript
- **Development**: `npm run dev` - Runs TypeScript compiler in watch mode
- **Test**: `npm test` - Runs the custom test suite
- **Run locally**: `./bin/twlint.js` (after building)

## Architecture Overview

### Core Components

1. **CLI Layer** (`src/cli.ts`): 
   - Entry point for the command-line tool
   - Two main commands: `invalid-classes` and `count-classes`
   - Handles argument parsing and output formatting (human/JSON)

2. **Scanner Engine** (`src/index.ts`):
   - Loads Tailwind v4's design system using `@tailwindcss/oxide`
   - Validates classes against Tailwind's built-in utilities
   - Tracks results per file with class occurrences and locations

3. **Context-Aware Extraction** (`src/context-aware-scanner.ts`):
   - Smart class extraction from various contexts:
     - HTML `class` attributes
     - React `className` props (including `cn()` function calls)
     - Vue.js (`:class`, `v-bind:class`)
     - Angular (`[ngClass]`)
     - Alpine.js (`x-bind:class`)
     - CSS `@apply` directives
   - Uses TypeScript AST parsing for accurate extraction from JSX/TSX

4. **MCP Server** (`mcp-server/`):
   - Python-based Model Context Protocol server
   - Enables AI assistants to use twlint functionality

### Key Implementation Details

- **Tailwind v4 Integration**: Uses `@tailwindcss/oxide` directly, ensuring compatibility with latest Tailwind features
- **Performance**: Processes files in parallel, uses efficient glob patterns
- **Context Filtering**: By default, only extracts classes from relevant contexts to minimize false positives
- **TypeScript**: Strict mode enabled, full type safety throughout

## Testing

Tests are located in `test/` and use a custom runner:
- Run all tests: `npm test`
- Test fixtures in `test/fixtures/` cover various scenarios
- Tests validate both the scanning logic and CLI output format

## Development Tips

1. When modifying class extraction logic, update `src/context-aware-scanner.ts`
2. For new Tailwind v4 features, ensure compatibility with the Oxide scanner API
3. Add test fixtures for new functionality in `test/fixtures/`
4. The project uses TypeScript strict mode - ensure all code passes type checking