#!/usr/bin/env python3
# /// script
# requires-python = ">=3.12"
# dependencies = [
#     "mcp>=1.12.0",
# ]
# ///
"""
MCP Server for twlint

This server provides tools for linting and validating TailwindCSS classes.
"""

import asyncio
import json
import subprocess
import os
from pathlib import Path
from typing import Any
from mcp.server.models import InitializationOptions
from mcp.server import NotificationOptions, Server
from mcp.server.stdio import stdio_server
from mcp.types import Tool, TextContent

# Path to the CLI tool
CLI_PATH = Path(__file__).parent.parent / "dist" / "cli.js"

def ensure_cli_built():
    """Ensure the CLI tool is built"""
    if not CLI_PATH.exists():
        raise RuntimeError(
            f"CLI tool not found at {CLI_PATH}. "
            "Please run 'pnpm run build' in the parent directory first."
        )

async def run_cli_command(args: list[str]) -> dict[str, Any]:
    """Run the CLI command and parse JSON output"""
    ensure_cli_built()
    
    cmd = ["node", str(CLI_PATH), "--json"] + args
    
    try:
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=os.getcwd()
        )
        
        stdout, stderr = await process.communicate()
        
        if stderr:
            error_msg = stderr.decode('utf-8')
            if process.returncode != 0 and not stdout:
                raise RuntimeError(f"CLI error: {error_msg}")
        
        # Parse JSON output
        output = stdout.decode('utf-8')
        return json.loads(output)
        
    except json.JSONDecodeError as e:
        raise RuntimeError(f"Failed to parse CLI output as JSON: {e}")
    except Exception as e:
        raise RuntimeError(f"Failed to run CLI: {e}")

# Create the server instance
server = Server("twlint")

@server.list_tools()
async def handle_list_tools() -> list[Tool]:
    """List available tools"""
    return [
        Tool(
            name="check_directory",
            description=(
                "Scan files for invalid TailwindCSS classes. "
                "Supports glob patterns and returns detailed results per file."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "css_path": {
                        "type": "string",
                        "description": "Path to CSS file containing Tailwind imports"
                    },
                    "files": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Files or glob patterns to scan (e.g., 'src/**/*.tsx')"
                    },
                    "no_filter": {
                        "type": "boolean",
                        "description": "Disable context-aware filtering",
                        "default": False
                    }
                },
                "required": ["css_path", "files"]
            }
        ),
        Tool(
            name="check_file",
            description="Quick check of a single file for invalid Tailwind classes",
            inputSchema={
                "type": "object",
                "properties": {
                    "css_path": {
                        "type": "string",
                        "description": "Path to CSS file containing Tailwind imports"
                    },
                    "file": {
                        "type": "string",
                        "description": "Single file to scan"
                    }
                },
                "required": ["css_path", "file"]
            }
        )
    ]

@server.call_tool()
async def handle_call_tool(name: str, arguments: dict[str, Any]) -> list[TextContent]:
    """Handle tool calls"""
    
    if name == "check_directory":
        css_path = arguments["css_path"]
        files = arguments["files"]
        no_filter = arguments.get("no_filter", False)
        
        # Build CLI arguments - always use JSON output
        cli_args = ["--json", "--path", css_path]
        if no_filter:
            cli_args.append("--no-filter")
        cli_args.extend(files)
        
        try:
            result = await run_cli_command(cli_args)
            
            # Format the response
            summary = result["summary"]
            invalid_classes = result["invalidClasses"]
            by_file = result["byFile"]
            
            # Return the raw JSON result for programmatic use
            return [TextContent(
                type="text",
                text=json.dumps(result, indent=2)
            )]
            
        except Exception as e:
            return [TextContent(
                type="text",
                text=f"Error: {str(e)}"
            )]
    
    elif name == "check_file":
        css_path = arguments["css_path"]
        file = arguments["file"]
        
        try:
            result = await run_cli_command(["--json", "--path", css_path, file])
            
            summary = result["summary"]
            by_file = result.get("byFile", [])
            
            # Always return the raw JSON result for programmatic use
            return [TextContent(
                type="text",
                text=json.dumps(result, indent=2)
            )]
            
        except Exception as e:
            return [TextContent(
                type="text",
                text=f"Error: {str(e)}"
            )]
    
    else:
        return [TextContent(
            type="text",
            text=f"Unknown tool: {name}"
        )]

async def amain():
    """Run the MCP server"""
    async with stdio_server() as (read_stream, write_stream):
        await server.run(
            read_stream,
            write_stream,
            InitializationOptions(
                server_name="twlint",
                server_version="1.0.0",
                capabilities=server.get_capabilities(
                    notification_options=NotificationOptions(),
                    experimental_capabilities={}
                )
            )
        )

def main():
    """Entry point for the MCP server"""
    asyncio.run(amain())

if __name__ == "__main__":
    main()