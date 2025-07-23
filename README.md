# twlint

A powerful linter for Tailwind CSS that scans your codebase and identifies invalid classes. Works with Tailwind CSS v4 and supports various frameworks including React, Vue, Angular, and more.

## Features

- 🔍 **Smart Detection**: Identifies classes that don't exist in your Tailwind configuration
- 🎯 **Context-Aware**: Extracts classes only from relevant contexts (className, class attributes, etc.)
- 📁 **Per-File Reporting**: Shows exactly which files contain invalid classes
- 🚀 **Fast**: Built on Tailwind's Oxide scanner for optimal performance
- 🔧 **Flexible**: Works with any file type - JSX, TSX, Vue, HTML, and more
- 🤖 **MCP Server**: Integrate with Claude Desktop or other MCP-compatible tools
- 🎨 **Tailwind v4**: Full support for the latest Tailwind CSS v4 features

## Installation

```bash
npm install -g twlint
```

Or use it directly with npx:

```bash
npx twlint --path ./src/styles.css ./src/**/*.tsx
```

## CLI Usage

### Basic Usage

Scan files for invalid Tailwind classes:

```bash
twlint --path ./src/styles.css ./src/**/*.{tsx,jsx}
```

### Options

- `--path, -p <path>` - Path to your CSS file containing Tailwind imports (required)
- `--no-filter` - Disable context-aware filtering (shows all candidates)
- `--json` - Output results as JSON for programmatic use
- `--help, -h` - Show help message

### Examples

Scan React components:
```bash
twlint -p styles.css "src/**/*.{tsx,jsx}"
```

Scan Vue single-file components:
```bash
twlint -p styles.css "src/**/*.vue"
```

Get JSON output for CI/CD:
```bash
twlint --json -p styles.css "src/**/*.tsx" > results.json
```

Scan without context filtering (not recommended):
```bash
twlint --no-filter -p styles.css index.html
```

### Output

#### Human-Readable Output (default)

```
Scanning for invalid Tailwind classes...
CSS file: /path/to/styles.css
Files: src/**/*.tsx

Total candidates found: 245
Valid classes: 243
Invalid classes: 2

Invalid classes found:

By file:

  src/components/Button.tsx:
    - bg-opacity-50
    - text-unknown-color
```

#### JSON Output

```json
{
  "summary": {
    "totalCandidates": 245,
    "validClasses": 243,
    "invalidClasses": 2,
    "contextAwareFiltering": true
  },
  "invalidClasses": ["bg-opacity-50", "text-unknown-color"],
  "byFile": [
    {
      "file": "src/components/Button.tsx",
      "invalidClasses": ["bg-opacity-50", "text-unknown-color"]
    }
  ]
}
```

## 🤖 MCP Server Integration

This package includes an MCP (Model Context Protocol) server that enables AI assistants like Claude to scan your codebase for invalid Tailwind classes.

### Quick Setup

Install the MCP server using uv:

```bash
cd mcp-server
uv pip install -e .
```

Add to Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "twlint": {
      "command": "uv",
      "args": ["run", "/path/to/twlint/mcp-server/server.py"]
    }
  }
}
```

Or if you've installed the package with `uv pip install -e .`:

```json
{
  "mcpServers": {
    "twlint": {
      "command": "uv",
      "args": ["run", "twlint-mcp"],
      "cwd": "/path/to/twlint/mcp-server"
    }
  }
}
```

Restart Claude Desktop and you're ready to go!

### What You Can Do

Once configured, you can ask Claude things like:
- "Scan my React components for invalid Tailwind classes"
- "Check if Button.tsx has any invalid Tailwind utilities"
- "Find all the deprecated Tailwind v3 classes in my project"

Claude will use the MCP tools to analyze your code and provide detailed feedback about invalid classes and how to fix them.

### Learn More

For detailed documentation about the MCP server, including advanced usage, troubleshooting, and development guides, see the [MCP Server README](./mcp-server/README.md).

## Context-Aware Filtering

By default, the scanner uses context-aware filtering to extract only actual CSS classes from:

- HTML: `class="..."`
- JSX/React: `className="..."` and `className={cn(...)}`
- Vue: `:class="..."`, `v-bind:class="..."`
- Angular: `[class]="..."`, `[ngClass]="..."`
- Alpine.js: `x-bind:class="..."`
- CSS: `@apply ...`

This dramatically reduces false positives by ignoring JavaScript variables, function names, and other non-class strings.

## How It Works

1. **Extraction**: Uses Tailwind's Oxide scanner to find potential class candidates
2. **Context Filtering**: Filters candidates based on their context (inside className, class attributes, etc.)
3. **Validation**: Uses Tailwind's design system to validate each candidate
4. **Reporting**: Groups invalid classes by file for easy fixing

## Tailwind v4 Compatibility

This tool is built specifically for Tailwind CSS v4 and understands:

- The new `@theme` directive
- CSS variables in theme definitions
- Plugin system changes
- Removed utilities (like `bg-opacity-*` in favor of `bg-color/opacity`)

## Common Issues

### "bg-opacity-50 is invalid"

In Tailwind v4, separate opacity utilities have been removed. Use the `/opacity` syntax instead:

```diff
- <div class="bg-red-500 bg-opacity-50">
+ <div class="bg-red-500/50">
```

### "prose classes are invalid"

Make sure you have the typography plugin installed and imported:

```css
@import "tailwindcss";
@plugin "@tailwindcss/typography";
```

### Classes in cn() not detected

The scanner supports common utility functions like `cn()`, `clsx()`, and `classNames()`. If your classes aren't being detected, they might be built dynamically at runtime.

## API Usage

You can also use this as a library:

```typescript
import { scanFiles } from 'twlint'

const result = await scanFiles(['./src/**/*.tsx'], {
  cssPath: './src/styles.css'
})

console.log('Invalid classes:', result.invalidCandidates)
```

### API Options

```typescript
interface ScanOptions {
  cssPath?: string
  cssContent?: string
  useContextAwareScanning?: boolean // default: true
  contexts?: {
    htmlClass?: boolean      // default: true
    jsxClassName?: boolean   // default: true
    vueClass?: boolean       // default: true
    angularClass?: boolean   // default: true
    alpineClass?: boolean    // default: true
    cssApply?: boolean       // default: true
    cssSelectors?: boolean   // default: false
  }
}
```

## Performance Tips

1. **Use specific glob patterns** - Instead of `**/*`, use `src/**/*.{tsx,jsx}`
2. **Exclude node_modules** - Add `!node_modules/**` to patterns if needed
3. **Use context-aware filtering** - Reduces candidates by ~40-60%
4. **Scan relevant files only** - Don't scan .json, .md, or other non-style files

## JSON Output

Use the `--json` flag to get structured output with per-file breakdown:

```bash
twlint --json --path ./styles.css "src/**/*.tsx"
```

Example output:
```json
{
  "summary": {
    "totalCandidates": 45,
    "validClasses": 42,
    "invalidClasses": 3,
    "contextAwareFiltering": true
  },
  "invalidClasses": ["fake-class", "invalid-utility", "not-real"],
  "byFile": [
    {
      "file": "/path/to/Component.tsx",
      "candidates": ["flex", "fake-class", "p-4"],
      "validClasses": ["flex", "p-4"],
      "invalidClasses": ["fake-class"]
    }
  ]
}
```

## API Usage

You can also use this as a library in your own projects:

```javascript
import { scanFiles } from 'twlint'

const result = await scanFiles(['./src/**/*.tsx'], {
  cssPath: './src/styles.css'
})

console.log(`Found ${result.invalidCandidates.length} invalid classes:`)
result.invalidCandidates.forEach(cls => console.log(`  - ${cls}`))
```

## Development

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test

# Watch mode for development
npm run dev
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT

