#!/usr/bin/env node

import { scanFiles } from './index.js'
import { resolve } from 'path'
import { existsSync } from 'fs'

// Parse command line arguments
function parseArgs(args: string[]) {
  const result = {
    cssPath: '',
    files: [] as string[],
    help: false,
    noFilter: false,
    json: false
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    
    if (arg === '--path' || arg === '-p') {
      result.cssPath = args[++i]
    } else if (arg === '--help' || arg === '-h') {
      result.help = true
    } else if (arg === '--no-filter') {
      result.noFilter = true
    } else if (arg === '--json') {
      result.json = true
    } else if (!arg.startsWith('-')) {
      result.files.push(arg)
    }
  }

  return result
}

function showHelp() {
  console.log(`
twlint - Tailwind CSS Linter

Usage: twlint [options] <files...>

Options:
  --path, -p <path>  Path to CSS file containing Tailwind imports (required)
  --no-filter        Disable context-aware filtering (shows all candidates)
  --json             Output results as JSON
  --help, -h         Show this help message

Examples:
  twlint --path ./src/styles.css ./src/**/*.tsx
  twlint -p styles.css index.html components/*.jsx
  twlint --no-filter -p styles.css index.html

Context-aware filtering (enabled by default) only extracts classes from:
  - HTML class attributes (class="...")
  - JSX className attributes (className="...")
  - Vue.js class bindings (:class, v-bind:class)
  - Angular class bindings ([class], [ngClass])
  - Alpine.js class bindings (x-bind:class)
  - CSS @apply directives
`)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))

  if (args.help || args.files.length === 0 || !args.cssPath) {
    showHelp()
    process.exit(args.help ? 0 : 1)
  }

  // Validate CSS file exists
  const cssPath = resolve(args.cssPath)
  if (!existsSync(cssPath)) {
    console.error(`Error: CSS file not found: ${cssPath}`)
    process.exit(1)
  }

  // Resolve file patterns
  const filePaths = args.files.map(f => resolve(f))

  if (!args.json) {
    console.log(`\nScanning for invalid Tailwind classes...`)
    console.log(`CSS file: ${cssPath}`)
    console.log(`Files: ${filePaths.join(', ')}\n`)
  }

  try {
    const result = await scanFiles(filePaths, { 
      cssPath,
      useContextAwareScanning: !args.noFilter
    })

    if (args.json) {
      // JSON output - optimize for large results
      const jsonOutput = {
        summary: {
          totalCandidates: result.allCandidates.length,
          validClasses: result.validCandidates.length,
          invalidClasses: result.invalidCandidates.length,
          contextAwareFiltering: !args.noFilter
        },
        invalidClasses: result.invalidCandidates,
        // Only include files that have invalid classes
        byFile: result.byFile?.filter(file => file.invalidClasses.length > 0)
          .map(file => ({
            file: file.file,
            invalidClasses: file.invalidClasses
          })) || []
      }
      
      // Use process.stdout.write to avoid any automatic formatting
      process.stdout.write(JSON.stringify(jsonOutput))
      process.stdout.write('\n')
      process.exit(result.invalidCandidates.length > 0 ? 1 : 0)
    } else {
      // Human-readable output
      console.log(`Total candidates found: ${result.allCandidates.length}`)
      console.log(`Valid classes: ${result.validCandidates.length}`)
      console.log(`Invalid classes: ${result.invalidCandidates.length}`)
      
      if (!args.noFilter) {
        console.log(`(Using context-aware filtering)`)
      }

      if (result.invalidCandidates.length > 0) {
        console.log('\nInvalid classes found:')
        
        // Show per-file results if available
        if (result.byFile && result.byFile.length > 0) {
          console.log('\nBy file:')
          for (const fileResult of result.byFile) {
            if (fileResult.invalidClasses.length > 0) {
              console.log(`\n  ${fileResult.file}:`)
              fileResult.invalidClasses.forEach(cls => console.log(`    - ${cls}`))
            }
          }
        } else {
          // Group by prefix for better readability
          const grouped = result.invalidCandidates.reduce((acc, cls) => {
            const prefix = cls.split('-')[0] || cls
            if (!acc[prefix]) acc[prefix] = []
            acc[prefix].push(cls)
            return acc
          }, {} as Record<string, string[]>)

          for (const [prefix, classes] of Object.entries(grouped)) {
            console.log(`\n  ${prefix}:`)
            classes.forEach(cls => console.log(`    - ${cls}`))
          }
        }
        
        process.exit(1) // Exit with error code if invalid classes found
      } else {
        console.log('\n✅ No invalid classes found!')
        process.exit(0)
      }
    }
  } catch (error) {
    console.error('Error:', error)
    process.exit(1)
  }
}

main()