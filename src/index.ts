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

export async function scanFile(filePath: string, options?: ScanOptions): Promise<ScanResult> {
  return findInvalidTailwindClasses(filePath, options)
}

export async function scanFiles(filePaths: string[], options?: ScanOptions): Promise<ScanResult> {
  return findInvalidTailwindClasses(filePaths, options)
}