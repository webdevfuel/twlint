import { Scanner } from '@tailwindcss/oxide'
import { readFileSync } from 'fs'

export interface FileCandidates {
  file: string
  candidates: Set<string>
}

export interface ContextAwareScannerOptions {
  sources: Array<{ base: string; pattern: string; negated: boolean }>
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

export class ContextAwareScanner {
  private scanner: Scanner
  private contexts: {
    htmlClass: boolean
    jsxClassName: boolean
    vueClass: boolean
    angularClass: boolean
    alpineClass: boolean
    cssApply: boolean
    cssSelectors: boolean
  }

  constructor(options: ContextAwareScannerOptions) {
    this.scanner = new Scanner({ sources: options.sources })
    
    // Default contexts - all enabled except CSS selectors
    this.contexts = {
      htmlClass: true,
      jsxClassName: true,
      vueClass: true,
      angularClass: true,
      alpineClass: true,
      cssApply: true,
      cssSelectors: false,
      ...(options.contexts || {})
    }
  }

  async scan(): Promise<string[]> {
    const result = await this.scanWithFileInfo()
    return result.allCandidates
  }

  async scanWithFileInfo(): Promise<{ allCandidates: string[], byFile: FileCandidates[] }> {
    // Get all candidates from the scanner
    const allCandidates = await this.scanner.scan()
    
    // Get all files that the scanner will process
    const files = this.scanner.files
    const byFile: FileCandidates[] = []
    
    // If no filtering needed, we still need to map candidates to files
    if (Object.values(this.contexts).every(v => v)) {
      // For now, we can't map unfiltered candidates to specific files
      // So we return all candidates without file mapping
      return { allCandidates, byFile: [] }
    }

    // Read each source file and filter candidates based on context
    const contextualCandidates = new Set<string>()
    
    for (const file of files) {
      try {
        const content = readFileSync(file, 'utf-8')
        const foundCandidates = this.extractContextualCandidates(content)
        
        if (foundCandidates.size > 0) {
          byFile.push({ file, candidates: foundCandidates })
          foundCandidates.forEach(c => contextualCandidates.add(c))
        }
      } catch (e) {
        // Skip files that can't be read
        continue
      }
    }

    // Only return candidates that were found in valid contexts
    const filteredCandidates = allCandidates.filter(candidate => contextualCandidates.has(candidate))
    return { allCandidates: filteredCandidates, byFile }
  }

  private extractContextualCandidates(content: string): Set<string> {
    const candidates = new Set<string>()
    
    // HTML class attributes
    if (this.contexts.htmlClass) {
      const htmlClassRegex = /\bclass\s*=\s*["']([^"']+)["']/g
      let match
      while ((match = htmlClassRegex.exec(content))) {
        match[1].split(/\s+/).forEach(cls => {
          if (cls) candidates.add(cls)
        })
      }
    }

    // JSX className attributes
    if (this.contexts.jsxClassName) {
      const jsxClassRegex = /\bclassName\s*=\s*["']([^"']+)["']/g
      let match
      while ((match = jsxClassRegex.exec(content))) {
        match[1].split(/\s+/).forEach(cls => {
          if (cls) candidates.add(cls)
        })
      }

      // Also handle template literals
      const jsxTemplateLiteralRegex = /\bclassName\s*=\s*{`([^`]+)`}/g
      while ((match = jsxTemplateLiteralRegex.exec(content))) {
        // Extract only the static parts, skip template expressions
        const templateContent = match[1]
        // Split by template expressions and only take the static parts
        const parts = templateContent.split(/\$\{[^}]*\}/)
        
        parts.forEach(part => {
          // Extract class names from each static part
          part.split(/\s+/).forEach(cls => {
            // Filter out empty strings, variables, and ternary operators
            if (cls && !cls.includes('?') && !cls.includes(':') && /^[a-zA-Z0-9\-_:/[\]()%.]+$/.test(cls)) {
              candidates.add(cls)
            }
          })
        })
      }

      // Handle cn() and similar utility functions
      const cnFunctionRegex = /\bclassName\s*=\s*\{[^}]*\bcn\s*\([^)]*["']([^"']+)["'][^)]*\)\s*\}/g
      while ((match = cnFunctionRegex.exec(content))) {
        // Extract classes from string arguments to cn()
        const stringContent = match[1]
        stringContent.split(/\s+/).forEach(cls => {
          if (cls && /^[a-zA-Z0-9\-_:/[\]()%.@*]+$/.test(cls) &&
              !['className', 'function', 'return', 'const', 'let', 'var', 'if', 'else'].includes(cls)) {
            candidates.add(cls)
          }
        })
      }
      
      // Also handle multi-line cn() calls
      const multiLineCnRegex = /\bclassName\s*=\s*\{[^}]*\bcn\s*\(([\s\S]*?)\)\s*\}/g
      while ((match = multiLineCnRegex.exec(content))) {
        // Extract all string literals from the cn() call
        const cnContent = match[1]
        const stringRegex = /["']([^"']+)["']/g
        let stringMatch
        while ((stringMatch = stringRegex.exec(cnContent))) {
          // Skip if this looks like it's part of code logic (e.g., after a comma without space)
          const beforeMatch = cnContent.substring(Math.max(0, stringMatch.index - 10), stringMatch.index)
          if (beforeMatch.match(/[,\(]\s*$/)) {
            stringMatch[1].split(/\s+/).forEach(cls => {
              // More strict validation to avoid JS keywords
              if (cls && /^[a-zA-Z0-9\-_:/[\]()%.@*]+$/.test(cls) && 
                  !['className', 'function', 'return', 'const', 'let', 'var', 'if', 'else'].includes(cls)) {
                candidates.add(cls)
              }
            })
          }
        }
      }
    }

    // Vue.js class bindings
    if (this.contexts.vueClass) {
      // :class="..." or v-bind:class="..."
      const vueClassRegex = /(?::class|v-bind:class)\s*=\s*["']([^"']+)["']/g
      let match
      while ((match = vueClassRegex.exec(content))) {
        // Simple string classes
        match[1].split(/\s+/).forEach(cls => {
          if (cls) candidates.add(cls)
        })
      }
    }

    // Angular class bindings
    if (this.contexts.angularClass) {
      // [class]="..." or [ngClass]="..."
      const angularClassRegex = /\[(?:class|ngClass)\]\s*=\s*["']([^"']+)["']/g
      let match
      while ((match = angularClassRegex.exec(content))) {
        match[1].split(/\s+/).forEach(cls => {
          if (cls) candidates.add(cls)
        })
      }
    }

    // Alpine.js x-bind:class
    if (this.contexts.alpineClass) {
      const alpineClassRegex = /x-bind:class\s*=\s*["']([^"']+)["']/g
      let match
      while ((match = alpineClassRegex.exec(content))) {
        match[1].split(/\s+/).forEach(cls => {
          if (cls) candidates.add(cls)
        })
      }
    }

    // CSS @apply directives
    if (this.contexts.cssApply) {
      const applyRegex = /@apply\s+([^;]+);/g
      let match
      while ((match = applyRegex.exec(content))) {
        match[1].split(/\s+/).forEach(cls => {
          if (cls) candidates.add(cls)
        })
      }
    }

    // CSS class selectors
    if (this.contexts.cssSelectors) {
      const classSelectorRegex = /\.([a-zA-Z0-9_-]+)(?:\s|{|:|,|\)|$)/g
      let match
      while ((match = classSelectorRegex.exec(content))) {
        candidates.add(match[1])
      }
    }

    return candidates
  }
}