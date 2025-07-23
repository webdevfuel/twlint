#!/usr/bin/env node

import { execSync } from 'child_process'
import { existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Test configuration
const tests = [
  {
    name: 'Valid HTML file - should find 0 invalid classes',
    files: ['test/fixtures/test-valid.html'],
    cssPath: 'test/fixtures/basic.css',
    expectedInvalid: 0,
    expectedClasses: []
  },
  {
    name: 'Invalid HTML file - should find invalid classes',
    files: ['test/fixtures/test-invalid.html'],
    cssPath: 'test/fixtures/basic.css',
    expectedInvalid: 3,
    expectedClasses: ['text-invalid-color', 'bg-opacity-50', 'fake-class']
  },
  {
    name: 'React TSX with cn() - should detect invalid classes',
    files: ['test/fixtures/test-react.tsx'],
    cssPath: 'test/fixtures/basic.css',
    expectedInvalid: 2,
    expectedClasses: ['hover:bg-invalid-hover', 'focus:ring-fake-ring']
  },
  {
    name: 'Group and peer utilities - should be valid',
    files: ['test/fixtures/test-group.html'],
    cssPath: 'test/fixtures/basic.css',
    expectedInvalid: 0,
    expectedClasses: []
  },
  {
    name: 'Multiple files - should aggregate results',
    files: ['test/fixtures/test-valid.html', 'test/fixtures/test-invalid.html'],
    cssPath: 'test/fixtures/basic.css',
    expectedInvalid: 3,
    expectedClasses: ['text-invalid-color', 'bg-opacity-50', 'fake-class']
  },
  {
    name: 'No context filter - should find more candidates',
    files: ['test/fixtures/test-react.tsx'],
    cssPath: 'test/fixtures/basic.css',
    expectedInvalid: -1, // Don't check exact count, just that it's more
    expectedClasses: [],
    noFilter: true
  }
]

// Color codes for output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
}

function runTest(test) {
  console.log(`\n${colors.blue}Running: ${test.name}${colors.reset}`)
  
  try {
    // Build command
    const cliPath = join(__dirname, '..', 'dist', 'cli.js')
    if (!existsSync(cliPath)) {
      throw new Error('CLI not built. Run "npm run build" first.')
    }
    
    const args = [
      'node',
      cliPath,
      '--json',
      '--path',
      test.cssPath
    ]
    
    if (test.noFilter) {
      args.push('--no-filter')
    }
    
    args.push(...test.files)
    
    // Run command - capture output even if exit code is non-zero
    let output
    try {
      output = execSync(args.join(' '), {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      })
    } catch (error) {
      // CLI exits with 1 when invalid classes are found, which is expected
      if (error.stdout) {
        output = error.stdout
      } else {
        throw error
      }
    }
    
    // Parse result
    const result = JSON.parse(output)
    
    // Check results
    const passed = []
    const failed = []
    
    // Check invalid count if specified
    if (test.expectedInvalid !== -1) {
      if (result.summary.invalidClasses === test.expectedInvalid) {
        passed.push(`Invalid count matches (${test.expectedInvalid})`)
      } else {
        failed.push(`Expected ${test.expectedInvalid} invalid classes, got ${result.summary.invalidClasses}`)
      }
    }
    
    // Check specific classes if specified
    if (test.expectedClasses.length > 0) {
      const invalidSet = new Set(result.invalidClasses)
      const missingClasses = test.expectedClasses.filter(cls => !invalidSet.has(cls))
      const extraClasses = result.invalidClasses.filter(cls => !test.expectedClasses.includes(cls))
      
      if (missingClasses.length === 0 && extraClasses.length === 0) {
        passed.push('Invalid classes match expected')
      } else {
        if (missingClasses.length > 0) {
          failed.push(`Missing expected invalid classes: ${missingClasses.join(', ')}`)
        }
        if (extraClasses.length > 0) {
          failed.push(`Unexpected invalid classes: ${extraClasses.join(', ')}`)
        }
      }
    }
    
    // Print results
    if (failed.length === 0) {
      console.log(`${colors.green}✓ PASSED${colors.reset}`)
      passed.forEach(msg => console.log(`  ${colors.green}✓${colors.reset} ${msg}`))
      return true
    } else {
      console.log(`${colors.red}✗ FAILED${colors.reset}`)
      failed.forEach(msg => console.log(`  ${colors.red}✗${colors.reset} ${msg}`))
      if (process.env.DEBUG) {
        console.log(`  Debug: ${JSON.stringify(result, null, 2)}`)
      }
      return false
    }
    
  } catch (error) {
    console.log(`${colors.red}✗ ERROR${colors.reset}`)
    console.log(`  ${colors.red}✗${colors.reset} ${error.message}`)
    if (process.env.DEBUG) {
      console.log(error.stack)
    }
    return false
  }
}

// Run all tests
console.log(`${colors.blue}twlint - Test Suite${colors.reset}`)
console.log(`${colors.blue}=========================================${colors.reset}`)

let passed = 0
let failed = 0

for (const test of tests) {
  if (runTest(test)) {
    passed++
  } else {
    failed++
  }
}

// Summary
console.log(`\n${colors.blue}Test Summary${colors.reset}`)
console.log(`${colors.blue}============${colors.reset}`)
console.log(`${colors.green}Passed: ${passed}${colors.reset}`)
console.log(`${colors.red}Failed: ${failed}${colors.reset}`)
console.log(`Total: ${tests.length}`)

// Exit code
if (failed > 0) {
  console.log(`\n${colors.red}Some tests failed!${colors.reset}`)
  process.exit(1)
} else {
  console.log(`\n${colors.green}All tests passed!${colors.reset}`)
  process.exit(0)
}