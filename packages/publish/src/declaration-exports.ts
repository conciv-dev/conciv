const VALUE_DECLARATION =
  /^(?:export )?declare (?:abstract class|class|const enum|enum|const|let|var|async function|function|namespace|module) ([\w$]+)/gm
const TYPE_DECLARATION = /^(?:export )?(?:declare )?(?:type|interface) ([\w$]+)/gm
const EXPORT_LIST = /^export (type )?\{([^}]*)\}(\s*from\s*['"][^'"]*['"])?/gm
const SPECIFIER = /^(type\s+)?([\w$]+)(?:\s+as\s+([\w$]+))?$/
const NAMESPACE_VALUE = /^\s*(?:export )?(?:declare )?(?:const|let|var|function|class|enum|namespace)\b/m

export function declarationExportProblems(source: string): string[] {
  const values = declaredValueNames(source)
  const types = new Set([...source.matchAll(TYPE_DECLARATION)].flatMap((match) => (match[1] ? [match[1]] : [])))
  return [...source.matchAll(EXPORT_LIST)]
    .filter((match) => match[3] === undefined)
    .flatMap((match) => exportListSpecifiers(match[2] ?? '', match[1] !== undefined))
    .flatMap((specifier) => specifierProblem(specifier, values, types))
}

type Specifier = {local: string; exported: string; typeOnly: boolean}

function declaredValueNames(source: string): Set<string> {
  return new Set(
    [...source.matchAll(VALUE_DECLARATION)].flatMap((match) => {
      const name = match[1]
      if (name === undefined) return []
      if (!/ (?:namespace|module) /.test(match[0])) return [name]
      return namespaceHasValues(source, match.index + match[0].length) ? [name] : []
    }),
  )
}

function namespaceHasValues(source: string, bodyStart: number): boolean {
  const bodyEnd = source.indexOf('\n}', bodyStart)
  const body = source.slice(bodyStart, bodyEnd === -1 ? undefined : bodyEnd)
  return NAMESPACE_VALUE.test(body.slice(body.indexOf('{') + 1))
}

function exportListSpecifiers(list: string, statementTypeOnly: boolean): Specifier[] {
  return list
    .split(',')
    .map((entry) => entry.trim())
    .flatMap((entry) => {
      const match = SPECIFIER.exec(entry)
      const local = match?.[2]
      if (match === null || local === undefined) return []
      return [{local, exported: match[3] ?? local, typeOnly: statementTypeOnly || match[1] !== undefined}]
    })
}

function specifierProblem(specifier: Specifier, values: Set<string>, types: Set<string>): string[] {
  const {local, exported, typeOnly} = specifier
  if (typeOnly && values.has(local)) {
    return [`"${exported}" is exported with "type" but "${local}" is declared as a value`]
  }
  if (!typeOnly && !values.has(local) && types.has(local)) {
    return [`"${exported}" is exported without "type" but "${local}" is declared only as a type`]
  }
  return []
}
