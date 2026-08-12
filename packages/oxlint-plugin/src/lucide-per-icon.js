import {createRequire} from 'node:module'
import {dirname} from 'node:path'

const LUCIDE_MODULE = 'lucide-solid'

function kebabCase(name) {
  return name
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/([A-Za-z])([0-9])/g, '$1-$2')
    .replace(/([0-9])([A-Za-z])/g, '$1-$2')
    .toLowerCase()
}

const resolutionCache = new Map()

function resolvesOnDisk(filename, iconPath) {
  const cacheKey = `${dirname(filename)}::${iconPath}`
  const cached = resolutionCache.get(cacheKey)
  if (cached !== undefined) return cached
  const resolved = tryResolve(filename, iconPath)
  resolutionCache.set(cacheKey, resolved)
  return resolved
}

function tryResolve(filename, iconPath) {
  try {
    createRequire(filename).resolve(iconPath)
    return true
  } catch {
    return false
  }
}

function isTypeOnlyDeclaration(node) {
  return node.importKind === 'type'
}

function isTypeOnlySpecifier(specifier) {
  return specifier.importKind === 'type'
}

function isImportSpecifier(specifier) {
  return specifier.type === 'ImportSpecifier'
}

function importedName(specifier) {
  return specifier.imported.type === 'Identifier' ? specifier.imported.name : specifier.imported.value
}

function specifierText(specifier) {
  const imported = importedName(specifier)
  const local = specifier.local.name
  return imported === local ? imported : `${imported} as ${local}`
}

function splitSpecifiers(node) {
  const valueSpecifiers = []
  const typeSpecifiers = []
  for (const specifier of node.specifiers) {
    if (!isImportSpecifier(specifier)) continue
    if (isTypeOnlySpecifier(specifier)) typeSpecifiers.push(specifier)
    else valueSpecifiers.push(specifier)
  }
  return {valueSpecifiers, typeSpecifiers}
}

function iconImportPath(specifier) {
  return `${LUCIDE_MODULE}/icons/${kebabCase(importedName(specifier))}`
}

function unresolvedSpecifier(filename, valueSpecifiers) {
  return valueSpecifiers.find((specifier) => !resolvesOnDisk(filename, iconImportPath(specifier)))
}

function valueImportLines(valueSpecifiers) {
  return valueSpecifiers.map((specifier) => `import ${specifier.local.name} from '${iconImportPath(specifier)}'`)
}

function typeImportLine(typeSpecifiers) {
  if (typeSpecifiers.length === 0) return []
  const names = typeSpecifiers.map(specifierText).join(', ')
  return [`import type {${names}} from '${LUCIDE_MODULE}'`]
}

function buildFix(node, valueSpecifiers, typeSpecifiers) {
  return (fixer) => {
    const lines = [...valueImportLines(valueSpecifiers), ...typeImportLine(typeSpecifiers)]
    return fixer.replaceText(node, lines.join('\n'))
  }
}

function reportResolved(node, context, valueSpecifiers, typeSpecifiers) {
  context.report({node, messageId: 'barrelImport', fix: buildFix(node, valueSpecifiers, typeSpecifiers)})
}

function reportUnresolved(node, context, blocker) {
  context.report({
    node,
    messageId: 'barrelImportUnresolved',
    data: {name: importedName(blocker), guess: iconImportPath(blocker)},
  })
}

function reportBlockedOrResolved(node, context, valueSpecifiers, typeSpecifiers) {
  const blocker = unresolvedSpecifier(context.filename, valueSpecifiers)
  if (blocker === undefined) reportResolved(node, context, valueSpecifiers, typeSpecifiers)
  else reportUnresolved(node, context, blocker)
}

function reportBarrelImport(node, context) {
  if (node.source.value !== LUCIDE_MODULE) return
  if (isTypeOnlyDeclaration(node)) return
  const {valueSpecifiers, typeSpecifiers} = splitSpecifiers(node)
  if (valueSpecifiers.length === 0) return
  reportBlockedOrResolved(node, context, valueSpecifiers, typeSpecifiers)
}

export default {
  meta: {
    type: 'problem',
    fixable: 'code',
    messages: {
      barrelImport:
        "Import each icon from its own entry point (e.g. import ArrowUp from 'lucide-solid/icons/arrow-up') instead of the 'lucide-solid' barrel: it pulls every icon module through the transform on cold start.",
      barrelImportUnresolved:
        "Import each icon from its own entry point instead of the 'lucide-solid' barrel, but '{{name}}' has no resolvable '{{guess}}' entry point (likely a legacy alias for a renamed icon): import it manually from its real per-icon path.",
    },
    schema: [],
  },
  createOnce(context) {
    return {
      ImportDeclaration(node) {
        reportBarrelImport(node, context)
      },
    }
  },
}
