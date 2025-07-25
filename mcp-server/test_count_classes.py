#!/usr/bin/env python3
"""Test the count_classes tool with path expansion"""

import asyncio
import json
from server import server, handle_call_tool

async def test_count_classes():
    """Test the count_classes tool"""
    
    # Test with tilde and glob patterns
    arguments = {
        "css_path": "~/code/robot/src/app/globals.css",
        "class_name": "text-sm",
        "files": ["~/code/robot/src/app/*.tsx"]
    }
    
    print("Testing count_classes with:")
    print(f"  css_path: {arguments['css_path']}")
    print(f"  class_name: {arguments['class_name']}")
    print(f"  files: {arguments['files']}")
    print()
    
    try:
        result = await handle_call_tool("count_classes", arguments)
        
        # Parse the JSON response
        if result and len(result) > 0:
            response_text = result[0].text
            
            if response_text.startswith("Error:"):
                print(f"Error occurred: {response_text}")
            else:
                # Parse and pretty print the JSON
                data = json.loads(response_text)
                print("Success! Result:")
                print(json.dumps(data, indent=2))
        else:
            print("No response received")
            
    except Exception as e:
        print(f"Exception: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_count_classes())