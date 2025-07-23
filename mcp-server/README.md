# MCP Server for twlint

An MCP (Model Context Protocol) server that helps AI assistants lint and validate Tailwind CSS classes in your codebase.

## 🚀 Quick Start

If you just want to get up and running quickly:

```bash
# Clone the repository (if you haven't already)
git clone https://github.com/yourusername/twlint.git
cd twlint/mcp-server

# Option 1: Install the package (recommended)
uv pip install -e .

# Add to Claude Desktop config for installed package:
{
  "mcpServers": {
    "twlint": {
      "command": "uv",
      "args": ["run", "twlint-mcp"],
      "cwd": "/absolute/path/to/twlint/mcp-server"
    }
  }
}

# Option 2: Run directly without installing
# Add to Claude Desktop config for direct execution:
{
  "mcpServers": {
    "twlint": {
      "command": "uv",
      "args": ["run", "/absolute/path/to/twlint/mcp-server/server.py"]
    }
  }
}

# Restart Claude Desktop
```

Now you can ask Claude to scan your files for invalid Tailwind classes!

## 📚 Tutorial: Your First Scan

Let's walk through scanning a React project for invalid Tailwind classes.

### Step 1: Set up your project

Make sure you have a CSS file that imports Tailwind:

```css
/* src/styles.css */
@import "tailwindcss";

@theme inline {
  --color-primary: blue;
  --color-secondary: green;
}
```

### Step 2: Ask Claude to scan your files

Once the MCP server is configured, you can simply ask Claude:

> "Can you scan my React components in src/components for invalid Tailwind classes? My CSS file is at src/styles.css"

Claude will use the MCP tools to scan your files and report:
- Which files contain invalid classes
- What those invalid classes are
- Why they're invalid (e.g., "bg-opacity-50 was removed in Tailwind v4")

### Step 3: Understanding the results

Claude might respond with something like:

> I found 3 invalid Tailwind classes in your project:
> 
> **src/components/Button.tsx:**
> - `bg-opacity-50` - This utility was removed in Tailwind v4. Use `bg-color/50` syntax instead
> - `text-made-up-color` - This color is not defined in your theme
> 
> **src/components/Card.tsx:**
> - `group-hover:bg-fake` - The color 'fake' doesn't exist

## 📖 How-To Guides

### How to scan an entire project

To scan all TypeScript files in your project:

```json
{
  "tool": "check_directory",
  "arguments": {
    "css_path": "./src/app.css",
    "files": ["src/**/*.{ts,tsx}", "components/**/*.{ts,tsx}"],
    "no_filter": false
  }
}
```

### How to check a specific file

For quick checks of a single component:

```json
{
  "tool": "check_file",
  "arguments": {
    "css_path": "./src/styles.css",
    "file": "src/components/Header.tsx"
  }
}
```

### How to scan without context filtering

If you want to see ALL potential class strings (not recommended):

```json
{
  "tool": "check_directory",
  "arguments": {
    "css_path": "./styles.css",
    "files": ["src/**/*.tsx"],
    "no_filter": true
  }
}
```

### How to work with monorepos

For monorepos with multiple packages:

```json
{
  "tool": "check_directory",
  "arguments": {
    "css_path": "./packages/ui/src/styles.css",
    "files": [
      "packages/ui/src/**/*.tsx",
      "apps/web/src/**/*.tsx"
    ]
  }
}
```

## 🔍 Understanding the Tools

### Context-Aware Filtering

By default, the scanner uses context-aware filtering to reduce false positives. It only extracts class names from:

- HTML `class` attributes
- React `className` props (including inside `cn()`, `clsx()` functions)
- Vue `:class` bindings
- Angular `[class]` bindings
- CSS `@apply` directives

This means it won't pick up random strings that happen to look like Tailwind classes from your JavaScript code.

### Tailwind v4 Compatibility

The scanner is built specifically for Tailwind CSS v4 and understands:

- The new `@theme` directive
- Removed utilities (like `bg-opacity-*`)
- CSS variable-based theme values
- Plugin system changes

### Performance Considerations

The scanner uses Tailwind's Oxide scanner for optimal performance. For large codebases:

- Use specific file patterns instead of `**/*`
- Scan directories incrementally
- Consider using `check_single_file` for quick iterations

## 📋 Reference

### Available Tools

#### `check_directory`

Scans multiple files or patterns for invalid Tailwind classes.

**Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `css_path` | string | Yes | - | Path to CSS file with Tailwind imports |
| `files` | array | Yes | - | File paths or glob patterns to scan |
| `no_filter` | boolean | No | false | Disable context-aware filtering |

**Returns:** JSON object with scan results

#### `check_file`

Quick check of a single file.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `css_path` | string | Yes | Path to CSS file with Tailwind imports |
| `file` | string | Yes | Single file path to check |

**Returns:** JSON object with scan results

### Response Schema

```typescript
interface ScanResult {
  summary: {
    totalCandidates: number    // Total class candidates found
    validClasses: number       // Classes that exist in Tailwind
    invalidClasses: number     // Classes that don't exist
    contextAwareFiltering: boolean // Whether filtering was used
  }
  invalidClasses: string[]     // List of all invalid classes
  byFile: Array<{             // Breakdown by file
    file: string              // File path
    invalidClasses: string[]  // Invalid classes in this file
  }>
}
```

### Common Invalid Classes

| Invalid Class | Issue | Fix |
|--------------|-------|-----|
| `bg-opacity-50` | Removed in v4 | Use `bg-color/50` |
| `text-made-up` | Not in theme | Add to theme or check spelling |
| `group` standalone | Valid but no CSS | Working as intended |
| `hover:bg-fake` | Invalid color | Use valid theme color |

## 🛠️ Development

### Project Structure

```
mcp-server/
├── server.py          # Main MCP server implementation
├── pyproject.toml     # Python package configuration
├── requirements.txt   # Python dependencies
├── test_server.py     # Test script for server responses
└── README.md          # This file
```

### Running Locally

```bash
# Install dependencies with uv
uv pip install -e .

# Run the server directly
uv run twlint-mcp

# Or run with Python directly
uv run python server.py

# Run tests
uv run python test_server.py
```

### How It Works

1. The MCP server receives tool calls from Claude
2. It invokes the Node.js CLI tool with appropriate arguments
3. The CLI tool uses Tailwind's design system to validate classes
4. Results are formatted as JSON and returned to Claude

### Adding New Tools

To add a new tool:

1. Add tool definition in `handle_list_tools()`
2. Add handler in `handle_call_tool()`
3. Update this documentation
4. Add tests in `test_server.py`

## 🐛 Troubleshooting

### Common Issues

**"CLI tool not found"**
```bash
cd ..  # Go to parent directory
npm install
npm run build
```

**"Module not found" errors**
- Ensure you're in the correct directory
- Check that `../dist/cli.js` exists
- Verify npm dependencies are installed

**No response from server**
1. Check Claude Desktop logs: `~/Library/Logs/Claude/mcp*.log`
2. Run server directly to see errors: `python server.py`
3. Verify Python 3.12+ is installed: `python --version`

### Debug Mode

For detailed debugging:

```bash
# Run server with debug output
MCP_DEBUG=1 python server.py

# Check Claude Desktop logs
tail -f ~/Library/Logs/Claude/mcp-server-twlint.log
```

### Getting Help

1. Check the [main project README](../README.md) for CLI-specific issues
2. Look for similar issues in the GitHub repository
3. Try the test script to verify basic functionality
4. Enable debug mode for more detailed error messages

## 📄 License

MIT - See the [LICENSE](../LICENSE) file for details.