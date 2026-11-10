import {basename, extname} from 'node:path'
import {pascalCase} from 'es-toolkit'
import type {Component} from '../../shared/catalog-defs.js'

export function importLine(component: Component): string {
  const named = component.names.find((name) => name !== DEFAULT_EXPORT)
  if (named !== undefined) return `import {${named}} from '${component.specifier}'`
  return `import ${pascalCase(basename(component.file, extname(component.file)))} from '${component.specifier}'`
}

const DEFAULT_EXPORT = 'default'
