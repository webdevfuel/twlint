#!/usr/bin/env node

import { scanFiles, countClassOccurrences } from './index.js'
import { resolve } from 'path'
import { existsSync } from 'fs'

// Types for command arguments
interface InvalidClassesArgs {
  cssPath: string
  files: string[]
  noFilter: boolean
  json: boolean
}

interface CountClassesArgs {
  cssPath: string
  files: string[]
  className: string
  json: boolean
}

interface GlobalArgs {
  help: boolean
  command?: string
  args: string[]
}

// Parse global arguments and determine command
function parseGlobalArgs(args: string[]): GlobalArgs {
  const result: GlobalArgs = {
    help: false,
    args: []
  }

  // Check for help flags first
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    result.help = true
    return result
  }

  // Check if first arg is a subcommand
  const firstArg = args[0]
  if (firstArg === 'invalid-classes' || firstArg === 'count-classes') {
    result.command = firstArg
    result.args = args.slice(1)
  } else {
    // No subcommand provided - show help
    result.help = true
  }

  return result
}

// Parse arguments for invalid-classes command
function parseInvalidClassesArgs(args: string[]): InvalidClassesArgs & { help: boolean } {
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

// Parse arguments for count-classes command
function parseCountClassesArgs(args: string[]): CountClassesArgs & { help: boolean } {
  const result = {
    cssPath: '',
    files: [] as string[],
    className: '',
    help: false,
    json: false
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    
    if (arg === '--path' || arg === '-p') {
      result.cssPath = args[++i]
    } else if (arg === '--class' || arg === '-c') {
      result.className = args[++i]
    } else if (arg === '--help' || arg === '-h') {
      result.help = true
    } else if (arg === '--json') {
      result.json = true
    } else if (!arg.startsWith('-')) {
      result.files.push(arg)
    }
  }

  return result
}

function showMainHelp() {
  console.log(`
twlint - Tailwind CSS Linter

Usage: twlint <command> [options]

Commands:
  invalid-classes  Find invalid Tailwind classes in your code
  count-classes    Count occurrences of a specific class

Options:
  --help, -h  Show help for a specific command

Examples:
  twlint invalid-classes --path ./src/styles.css ./src/**/*.tsx
  twlint count-classes --class bg-blue-500 --path styles.css ./src/**/*.tsx
  twlint --help
  twlint invalid-classes --help
`)
}

function showInvalidClassesHelp() {
  console.log(`
twlint invalid-classes - Find invalid Tailwind classes

Usage: twlint invalid-classes [options] <files...>

Options:
  --path, -p <path>  Path to CSS file containing Tailwind imports (required)
  --no-filter        Disable context-aware filtering (shows all candidates)
  --json             Output results as JSON
  --help, -h         Show this help message

Examples:
  twlint invalid-classes --path ./src/styles.css ./src/**/*.tsx
  twlint invalid-classes -p styles.css index.html components/*.jsx
  twlint invalid-classes --no-filter -p styles.css index.html

Context-aware filtering (enabled by default) only extracts classes from:
  - HTML class attributes (class="...")
  - JSX className attributes (className="...")
  - Vue.js class bindings (:class, v-bind:class)
  - Angular class bindings ([class], [ngClass])
  - Alpine.js class bindings (x-bind:class)
  - CSS @apply directives
`)
}

function showCountClassesHelp() {
  console.log(`
twlint count-classes - Count occurrences of a specific class

Usage: twlint count-classes [options] <files...>

Options:
  --class, -c <name>  The class name to count (required)
  --path, -p <path>   Path to CSS file containing Tailwind imports (required)
  --json              Output results as JSON
  --help, -h          Show this help message

Examples:
  twlint count-classes --class bg-blue-500 --path styles.css ./src/**/*.tsx
  twlint count-classes -c text-center -p ./src/styles.css index.html
  twlint count-classes --json --class flex --path styles.css ./src/**/*
`)
}

async function runInvalidClasses(args: string[]) {
  const parsedArgs = parseInvalidClassesArgs(args)

  if (parsedArgs.help) {
    showInvalidClassesHelp()
    process.exit(0)
  }

  if (parsedArgs.files.length === 0 || !parsedArgs.cssPath) {
    showInvalidClassesHelp()
    process.exit(1)
  }

  // Validate CSS file exists
  const cssPath = resolve(parsedArgs.cssPath)
  if (!existsSync(cssPath)) {
    console.error(`Error: CSS file not found: ${cssPath}`)
    process.exit(1)
  }

  // Resolve file patterns
  const filePaths = parsedArgs.files.map(f => resolve(f))

  if (!parsedArgs.json) {
    console.log(`\nScanning for invalid Tailwind classes...`)
    console.log(`CSS file: ${cssPath}`)
    console.log(`Files: ${filePaths.join(', ')}\n`)
  }

  try {
    const result = await scanFiles(filePaths, { 
      cssPath,
      useContextAwareScanning: !parsedArgs.noFilter
    })

    if (parsedArgs.json) {
      // JSON output - optimize for large results
      const jsonOutput = {
        summary: {
          totalCandidates: result.allCandidates.length,
          validClasses: result.validCandidates.length,
          invalidClasses: result.invalidCandidates.length,
          contextAwareFiltering: !parsedArgs.noFilter
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
      
      if (!parsedArgs.noFilter) {
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

async function runCountClasses(args: string[]) {
  const parsedArgs = parseCountClassesArgs(args)

  if (parsedArgs.help) {
    showCountClassesHelp()
    process.exit(0)
  }

  if (parsedArgs.files.length === 0 || !parsedArgs.cssPath || !parsedArgs.className) {
    showCountClassesHelp()
    process.exit(1)
  }

  // Validate CSS file exists
  const cssPath = resolve(parsedArgs.cssPath)
  if (!existsSync(cssPath)) {
    console.error(`Error: CSS file not found: ${cssPath}`)
    process.exit(1)
  }

  // Resolve file patterns
  const filePaths = parsedArgs.files.map(f => resolve(f))

  if (!parsedArgs.json) {
    console.log(`\nCounting occurrences of class: ${parsedArgs.className}`)
    console.log(`CSS file: ${cssPath}`)
    console.log(`Files: ${filePaths.join(', ')}\n`)
  }

  try {
    const result = await countClassOccurrences(filePaths, parsedArgs.className, { cssPath })

    if (parsedArgs.json) {
      // JSON output
      const jsonOutput = {
        className: parsedArgs.className,
        totalOccurrences: result.totalCount,
        fileCount: result.fileCount,
        isValidClass: result.isValidClass,
        byFile: result.byFile
      }
      
      process.stdout.write(JSON.stringify(jsonOutput))
      process.stdout.write('\n')
      process.exit(0)
    } else {
      // Human-readable output
      console.log(`Class: ${parsedArgs.className}`)
      console.log(`Valid Tailwind class: ${result.isValidClass ? 'Yes' : 'No'}`)
      console.log(`Total occurrences: ${result.totalCount}`)
      console.log(`Files containing class: ${result.fileCount}`)

      if (result.totalCount > 0 && result.byFile.length > 0) {
        console.log('\nOccurrences by file:')
        for (const fileResult of result.byFile) {
          console.log(`\n  ${fileResult.file}: ${fileResult.count} occurrence${fileResult.count !== 1 ? 's' : ''}`)
          if (fileResult.locations && fileResult.locations.length > 0) {
            fileResult.locations.slice(0, 5).forEach(loc => {
              console.log(`    Line ${loc.line}, Column ${loc.column}`)
            })
            if (fileResult.locations.length > 5) {
              console.log(`    ... and ${fileResult.locations.length - 5} more`)
            }
          }
        }
      }

      process.exit(0)
    }
  } catch (error) {
    console.error('Error:', error)
    process.exit(1)
  }
}

async function main() {
  const globalArgs = parseGlobalArgs(process.argv.slice(2))

  if (globalArgs.help && !globalArgs.command) {
    showMainHelp()
    process.exit(0)
  }

  switch (globalArgs.command) {
    case 'invalid-classes':
      await runInvalidClasses(globalArgs.args)
      break
    case 'count-classes':
      await runCountClasses(globalArgs.args)
      break
    default:
      showMainHelp()
      process.exit(1)
  }
}

main()