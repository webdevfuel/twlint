#!/usr/bin/env python3
"""Debug script to test CLI command execution"""

import asyncio
import json
import subprocess
import os
from pathlib import Path

CLI_PATH = Path(__file__).parent.parent / "dist" / "cli.js"

async def run_cli_command_debug(args: list[str]):
    """Run the CLI command with debugging output"""
    
    cmd = ["node", str(CLI_PATH)] + args
    
    print(f"Command: {' '.join(cmd)}")
    print(f"Working directory: {os.getcwd()}")
    
    try:
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=os.getcwd()
        )
        
        stdout, stderr = await process.communicate()
        
        print(f"\nReturn code: {process.returncode}")
        print(f"Stdout length: {len(stdout)} bytes")
        print(f"Stderr length: {len(stderr)} bytes")
        
        if stderr:
            print(f"\nStderr output:")
            print(stderr.decode('utf-8'))
        
        print(f"\nStdout output (raw bytes):")
        print(repr(stdout[:200]))  # First 200 bytes
        
        print(f"\nStdout output (decoded):")
        output = stdout.decode('utf-8')
        print(output[:500])  # First 500 chars
        
        # Try to parse as JSON
        try:
            result = json.loads(output)
            print(f"\nJSON parsed successfully!")
            print(json.dumps(result, indent=2))
        except json.JSONDecodeError as e:
            print(f"\nJSON parse error: {e}")
            print(f"Error position: line {e.lineno}, column {e.colno}")
            
            # Show the problematic area
            lines = output.split('\n')
            if e.lineno <= len(lines):
                print(f"\nProblematic line {e.lineno}: {repr(lines[e.lineno-1])}")
                if e.lineno > 1:
                    print(f"Previous line {e.lineno-1}: {repr(lines[e.lineno-2])}")
                if e.lineno < len(lines):
                    print(f"Next line {e.lineno+1}: {repr(lines[e.lineno])}")
        
    except Exception as e:
        print(f"\nException: {type(e).__name__}: {e}")

async def main():
    # Test 1: Simple paths
    print("=== Test 1: Simple paths ===")
    await run_cli_command_debug([
        "count-classes", 
        "--class", "text-sm", 
        "--path", "test/fixtures/basic.css",
        "test/fixtures/test-valid.html",
        "--json"
    ])
    
    print("\n\n=== Test 2: Paths with tilde ===")
    # Expand tilde manually
    home = str(Path.home())
    css_path = os.path.expanduser("~/code/robot/src/app/globals.css")
    file_pattern = os.path.expanduser("~/code/robot/src/app/*.tsx")
    
    await run_cli_command_debug([
        "count-classes", 
        "--class", "text-sm", 
        "--path", css_path,
        file_pattern,
        "--json"
    ])

if __name__ == "__main__":
    asyncio.run(main())