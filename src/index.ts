import { Scanner } from '@tailwindcss/oxide'
import { __unstable__loadDesignSystem } from 'tailwindcss'
import { readFileSync } from 'fs'
import { resolve, dirname, join } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { createRequire } from 'module'
import { ContextAwareScanner } from './context-aware-scanner.js'

export interface FileResult {
  file: string
  candidates: string[]
  validClasses: string[]
  invalidClasses: string[]
}

export interface ScanResult {
  allCandidates: string[]
  validCandidates: string[]
  invalidCandidates: string[]
  byFile?: FileResult[]
}

export interface ScanOptions {
  cssPath?: string
  cssContent?: string
  sources?: Array<{ base: string; pattern: string; negated: boolean }>
  useContextAwareScanning?: boolean
  contexts?: {
    htmlClass?: boolean
    jsxClassName?: boolean
    vueClass?: boolean
    angularClass?: boolean
    alpineClass?: boolean
    cssApply?: boolean
    cssSelectors?: boolean
  }
}

export async function findInvalidTailwindClasses(
  filePaths: string | string[],
  options: ScanOptions = {}
): Promise<ScanResult> {
  // Load CSS content
  let cssContent = options.cssContent
  if (!cssContent && options.cssPath) {
    cssContent = readFileSync(options.cssPath, 'utf-8')
  }
  if (!cssContent) {
    cssContent = '@import "tailwindcss";'
  }

  // Prepare sources for scanner
  const sources = options.sources?.map(s => ({ ...s, negated: s.negated ?? false })) || 
    (Array.isArray(filePaths) ? filePaths : [filePaths]).map(path => ({
      base: '.',
      pattern: resolve(path),
      negated: false
    }))

  // Create scanner (use context-aware by default)
  let allCandidates: string[]
  let fileCandidatesMap: Map<string, Set<string>> = new Map()
  
  if (options.useContextAwareScanning !== false) {
    // Use context-aware scanner by default
    const scanner = new ContextAwareScanner({ 
      sources,
      contexts: options.contexts 
    })
    const result = await scanner.scanWithFileInfo()
    allCandidates = result.allCandidates
    
    // Build file candidates map
    for (const fc of result.byFile) {
      fileCandidatesMap.set(fc.file, fc.candidates)
    }
  } else {
    // Use regular scanner if explicitly disabled
    const scanner = new Scanner({ sources })
    allCandidates = await scanner.scan()
  }

  // Get the path to the actual TailwindCSS files
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = dirname(__filename)
  
  // Try to find the TailwindCSS package
  let tailwindContent = ''
  const possiblePaths = [
    resolve(__dirname, '../node_modules/tailwindcss/index.css'),
    resolve(__dirname, '../../node_modules/tailwindcss/index.css'),
    resolve(process.cwd(), 'node_modules/tailwindcss/index.css')
  ]
  
  for (const path of possiblePaths) {
    try {
      tailwindContent = readFileSync(path, 'utf-8')
      break
    } catch (e) {
      // Continue to next path
    }
  }
  
  if (!tailwindContent && process.stderr) {
    process.stderr.write('Warning: Could not load TailwindCSS files, validation may be incomplete\n')
  }

  // Define loader functions for TailwindCSS v4
  const compileOptions = {
    loadStylesheet: async (id: string, base: string) => {
      // Handle tailwindcss imports
      if (id === 'tailwindcss') {
        return {
          path: id,
          base: base || '.',
          content: tailwindContent || '@theme{}'
        }
      }
      // For other stylesheets, return empty
      return {
        path: id,
        base: base || '.',
        content: ''
      }
    },
    loadModule: async (id: string, base: string, resourceHint: 'plugin' | 'config' = 'plugin') => {
      // Create a require function from the base directory
      const requireFromBase = createRequire(join(base || process.cwd(), 'package.json'))
      
      try {
        // Try to resolve the module
        let resolvedPath: string
        try {
          resolvedPath = requireFromBase.resolve(id)
        } catch (e) {
          // Try from current working directory if base resolution fails
          const requireFromCwd = createRequire(join(process.cwd(), 'package.json'))
          try {
            resolvedPath = requireFromCwd.resolve(id)
          } catch (e2) {
            // If CSS path is provided, also try from the CSS file's directory
            if (options.cssPath) {
              const requireFromCss = createRequire(join(dirname(resolve(options.cssPath)), 'package.json'))
              resolvedPath = requireFromCss.resolve(id)
            } else {
              throw e2
            }
          }
        }
        
        // Import the module
        const moduleUrl = pathToFileURL(resolvedPath).href
        const module = await import(moduleUrl)
        
        // Return in the expected format
        return {
          path: resolvedPath,
          base: dirname(resolvedPath),
          module: module.default ?? module
        }
      } catch (e) {
        // If we can't load the module, warn and return a stub
        // Write warnings to stderr to avoid corrupting JSON output
        if (process.stderr) {
          process.stderr.write(`Warning: Could not load plugin ${id} - some utilities may be missing\n`)
          process.stderr.write(`  Error: ${e instanceof Error ? e.message : String(e)}\n`)
        }
        
        // Return a minimal plugin that does nothing
        return {
          path: id,
          base: base || '.',
          module: {
            handler: () => {},
            config: {}
          }
        }
      }
    }
  }

  // Load design system to access validation methods
  const designSystem = await __unstable__loadDesignSystem(cssContent, compileOptions)

  // Special classes that are valid but don't generate CSS by themselves
  const MARKER_CLASSES = new Set(['group', 'peer'])

  // Validate each candidate
  const validCandidates: string[] = []
  const invalidCandidates: string[] = []
  const validSet = new Set<string>()
  const invalidSet = new Set<string>()

  for (const candidate of allCandidates) {
    // Check if this is a known marker class
    if (MARKER_CLASSES.has(candidate)) {
      validCandidates.push(candidate)
      validSet.add(candidate)
      continue
    }

    // Try to parse the candidate
    const parsed = designSystem.parseCandidate(candidate)
    
    if (parsed === null || parsed.length === 0) {
      // Can't parse = invalid
      invalidCandidates.push(candidate)
      invalidSet.add(candidate)
      continue
    }

    // Try to compile the parsed candidate to CSS
    let hasValidCSS = false
    for (const candidateAst of parsed) {
      const compiled = designSystem.compileAstNodes(candidateAst)
      if (compiled.length > 0) {
        hasValidCSS = true
        break
      }
    }
    
    if (hasValidCSS) {
      // CSS generated = valid
      validCandidates.push(candidate)
      validSet.add(candidate)
    } else {
      // No CSS generated = invalid
      invalidCandidates.push(candidate)
      invalidSet.add(candidate)
    }
  }

  // Build per-file results if we have file candidate mapping
  const byFile: FileResult[] = []
  if (fileCandidatesMap.size > 0) {
    for (const [file, candidates] of fileCandidatesMap) {
      const fileValidClasses = Array.from(candidates).filter(c => validSet.has(c))
      const fileInvalidClasses = Array.from(candidates).filter(c => invalidSet.has(c))
      
      if (fileInvalidClasses.length > 0 || fileValidClasses.length > 0) {
        byFile.push({
          file,
          candidates: Array.from(candidates),
          validClasses: fileValidClasses,
          invalidClasses: fileInvalidClasses
        })
      }
    }
  }

  return {
    allCandidates,
    validCandidates,
    invalidCandidates,
    byFile: byFile.length > 0 ? byFile : undefined
  }
}

export interface ClassLocation {
  line: number
  column: number
  context?: string
}

export interface FileClassCount {
  file: string
  count: number
  locations?: ClassLocation[]
}

export interface CountResult {
  className: string
  totalCount: number
  fileCount: number
  isValidClass: boolean
  byFile: FileClassCount[]
}

export async function countClassOccurrences(
  filePaths: string | string[],
  className: string,
  options: ScanOptions = {}
): Promise<CountResult> {
  // First check if the class is valid
  const validationResult = await findInvalidTailwindClasses([''], {
    ...options,
    sources: [{
      base: '.',
      pattern: '/dev/null',
      negated: false
    }]
  })

  // Load design system to validate the specific class
  let cssContent = options.cssContent
  if (!cssContent && options.cssPath) {
    cssContent = readFileSync(options.cssPath, 'utf-8')
  }
  if (!cssContent) {
    cssContent = '@import "tailwindcss";'
  }

  // Get the path to the actual TailwindCSS files
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = dirname(__filename)
  
  let tailwindContent = ''
  const possiblePaths = [
    resolve(__dirname, '../node_modules/tailwindcss/index.css'),
    resolve(__dirname, '../../node_modules/tailwindcss/index.css'),
    resolve(process.cwd(), 'node_modules/tailwindcss/index.css')
  ]
  
  for (const path of possiblePaths) {
    try {
      tailwindContent = readFileSync(path, 'utf-8')
      break
    } catch (e) {
      // Continue to next path
    }
  }

  // Define loader functions for TailwindCSS v4
  const compileOptions = {
    loadStylesheet: async (id: string, base: string) => {
      if (id === 'tailwindcss') {
        return {
          path: id,
          base: base || '.',
          content: tailwindContent || '@theme{}'
        }
      }
      return {
        path: id,
        base: base || '.',
        content: ''
      }
    },
    loadModule: async (id: string, base: string, resourceHint: 'plugin' | 'config' = 'plugin') => {
      const requireFromBase = createRequire(join(base || process.cwd(), 'package.json'))
      
      try {
        let resolvedPath: string
        try {
          resolvedPath = requireFromBase.resolve(id)
        } catch (e) {
          const requireFromCwd = createRequire(join(process.cwd(), 'package.json'))
          try {
            resolvedPath = requireFromCwd.resolve(id)
          } catch (e2) {
            if (options.cssPath) {
              const requireFromCss = createRequire(join(dirname(resolve(options.cssPath)), 'package.json'))
              resolvedPath = requireFromCss.resolve(id)
            } else {
              throw e2
            }
          }
        }
        
        const moduleUrl = pathToFileURL(resolvedPath).href
        const module = await import(moduleUrl)
        
        return {
          path: resolvedPath,
          base: dirname(resolvedPath),
          module: module.default ?? module
        }
      } catch (e) {
        return {
          path: id,
          base: base || '.',
          module: {
            handler: () => {},
            config: {}
          }
        }
      }
    }
  }

  // Load design system to validate the class
  const designSystem = await __unstable__loadDesignSystem(cssContent, compileOptions)
  
  // Check if the class is valid
  const MARKER_CLASSES = new Set(['group', 'peer'])
  let isValidClass = false
  
  if (MARKER_CLASSES.has(className)) {
    isValidClass = true
  } else {
    const parsed = designSystem.parseCandidate(className)
    if (parsed !== null && parsed.length > 0) {
      for (const candidateAst of parsed) {
        const compiled = designSystem.compileAstNodes(candidateAst)
        if (compiled.length > 0) {
          isValidClass = true
          break
        }
      }
    }
  }

  // Now count occurrences in files
  const sources = options.sources?.map(s => ({ ...s, negated: s.negated ?? false })) || 
    (Array.isArray(filePaths) ? filePaths : [filePaths]).map(path => ({
      base: '.',
      pattern: resolve(path),
      negated: false
    }))

  const scanner = new Scanner({ sources })
  const files = scanner.files
  
  let totalCount = 0
  const byFile: FileClassCount[] = []
  
  for (const file of files) {
    try {
      const content = readFileSync(file, 'utf-8')
      const locations = findClassOccurrences(content, className)
      
      if (locations.length > 0) {
        byFile.push({
          file,
          count: locations.length,
          locations
        })
        totalCount += locations.length
      }
    } catch (e) {
      // Skip files that can't be read
      continue
    }
  }

  return {
    className,
    totalCount,
    fileCount: byFile.length,
    isValidClass,
    byFile
  }
}

function findClassOccurrences(content: string, className: string): ClassLocation[] {
  const locations: ClassLocation[] = []
  const lines = content.split('\n')
  
  // Escape special regex characters in className
  const escapedClassName = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  
  // Pattern to match the class in various contexts
  const patterns = [
    // HTML class attribute
    new RegExp(`\\bclass\\s*=\\s*["'][^"']*\\b${escapedClassName}\\b[^"']*["']`, 'g'),
    // JSX className attribute
    new RegExp(`\\bclassName\\s*=\\s*["'][^"']*\\b${escapedClassName}\\b[^"']*["']`, 'g'),
    // JSX className with template literal
    new RegExp(`\\bclassName\\s*=\\s*\{\`[^\`]*\\b${escapedClassName}\\b[^\`]*\`\}`, 'g'),
    // Vue class binding
    new RegExp(`(?::class|v-bind:class)\\s*=\\s*["'][^"']*\\b${escapedClassName}\\b[^"']*["']`, 'g'),
    // Angular class binding
    new RegExp(`\\[(?:class|ngClass)\\]\\s*=\\s*["'][^"']*\\b${escapedClassName}\\b[^"']*["']`, 'g'),
    // Alpine.js class binding
    new RegExp(`x-bind:class\\s*=\\s*["'][^"']*\\b${escapedClassName}\\b[^"']*["']`, 'g'),
    // CSS @apply
    new RegExp(`@apply\\s+[^;]*\\b${escapedClassName}\\b[^;]*;`, 'g'),
    // cn() function and similar
    new RegExp(`\\bcn\\s*\\([^)]*["'][^"']*\\b${escapedClassName}\\b[^"']*["'][^)]*\\)`, 'g')
  ]
  
  lines.forEach((line, lineIndex) => {
    patterns.forEach(pattern => {
      let match
      pattern.lastIndex = 0 // Reset regex state
      while ((match = pattern.exec(line)) !== null) {
        // Find the exact position of the class name within the match
        const matchText = match[0]
        const classIndex = matchText.search(new RegExp(`\\b${escapedClassName}\\b`))
        if (classIndex !== -1) {
          locations.push({
            line: lineIndex + 1,
            column: match.index + classIndex + 1,
            context: line.trim()
          })
        }
      }
    })
  })
  
  // Remove duplicates (same line and column)
  const uniqueLocations = locations.filter((loc, index, self) =>
    index === self.findIndex((l) => l.line === loc.line && l.column === loc.column)
  )
  
  return uniqueLocations.sort((a, b) => a.line - b.line || a.column - b.column)
}

export async function scanFile(filePath: string, options?: ScanOptions): Promise<ScanResult> {
  return findInvalidTailwindClasses(filePath, options)
}

export async function scanFiles(filePaths: string[], options?: ScanOptions): Promise<ScanResult> {
  return findInvalidTailwindClasses(filePaths, options)
}