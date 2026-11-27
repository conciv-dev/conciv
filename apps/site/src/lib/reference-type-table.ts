import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import type {DocEntry, GeneratedDoc, Generator} from 'fumadocs-typescript'
import type {JSONOutput, PackageIndex} from '@internal/reference'

type Reflection = JSONOutput.DeclarationReflection
type SomeType = JSONOutput.SomeType
type Signature = JSONOutput.SignatureReflection

type LoadedPackage = {
  project: JSONOutput.ProjectReflection
  byId: ReadonlyMap<number, Reflection>
}

const MEMBER_KINDS = [1024, 2048, 262144]
const SIMPLE_TYPE_LENGTH = 48

function readJson(require: NodeJS.Require, file: string): unknown {
  return JSON.parse(readFileSync(require.resolve(`@internal/reference/data/${file}`), 'utf8'))
}

function indexReflections(node: JSONOutput.ContainerReflection, byId: Map<number, Reflection>) {
  for (const child of node.children ?? []) {
    byId.set(child.id, child)
    indexReflections(child, byId)
  }
}

function writeParts(parts: readonly JSONOutput.CommentDisplayPart[] | undefined): string {
  return (parts ?? []).map((part) => part.text).join('')
}

function writeSignature(signature: Signature): string {
  const params = (signature.parameters ?? []).map(
    (param) =>
      `${param.flags.isRest ? '...' : ''}${param.name}${param.flags.isOptional ? '?' : ''}: ${writeType(param.type)}`,
  )
  return `(${params.join(', ')}) => ${writeType(signature.type)}`
}

function writeObject(declaration: Reflection): string {
  if (declaration.signatures !== undefined) return declaration.signatures.map(writeSignature).join(' & ')
  const members = (declaration.children ?? []).map(
    (child) => `${child.name}${child.flags.isOptional ? '?' : ''}: ${writeMemberType(child)}`,
  )
  return members.length === 0 ? '{}' : `{ ${members.join('; ')} }`
}

function writeTypeArguments(args: readonly SomeType[] | undefined): string {
  return args === undefined || args.length === 0 ? '' : `<${args.map(writeType).join(', ')}>`
}

type Writers = {[K in keyof JSONOutput.TypeKindMap]: (type: JSONOutput.TypeKindMap[K]) => string}

const WRITERS: Writers = {
  intrinsic: (type) => type.name,
  literal: (type) =>
    typeof type.value === 'object' && type.value !== null
      ? `${type.value.negative ? '-' : ''}${type.value.value}n`
      : JSON.stringify(type.value),
  reference: (type) => `${type.name}${writeTypeArguments(type.typeArguments)}`,
  union: (type) => type.types.map(writeType).join(' | '),
  intersection: (type) => type.types.map(writeType).join(' & '),
  array: (type) => `${writeType(type.elementType)}[]`,
  tuple: (type) => `[${(type.elements ?? []).map(writeType).join(', ')}]`,
  namedTupleMember: (type) => `${type.name}${type.isOptional ? '?' : ''}: ${writeType(type.element)}`,
  optional: (type) => `${writeType(type.elementType)}?`,
  rest: (type) => `...${writeType(type.elementType)}`,
  reflection: (type) => writeObject(type.declaration),
  typeOperator: (type) => `${type.operator} ${writeType(type.target)}`,
  indexedAccess: (type) => `${writeType(type.objectType)}[${writeType(type.indexType)}]`,
  query: (type) => `typeof ${writeType(type.queryType)}`,
  conditional: (type) =>
    `${writeType(type.checkType)} extends ${writeType(type.extendsType)} ? ${writeType(type.trueType)} : ${writeType(type.falseType)}`,
  mapped: (type) => `{ [${type.parameter} in ${writeType(type.parameterType)}]: ${writeType(type.templateType)} }`,
  inferred: (type) => `infer ${type.name}`,
  predicate: (type) =>
    `${type.asserts ? 'asserts ' : ''}${type.name}${type.targetType === undefined ? '' : ` is ${writeType(type.targetType)}`}`,
  templateLiteral: (type) =>
    `\`${type.head}${type.tail.map(([part, text]) => `\${${writeType(part)}}${text}`).join('')}\``,
  unknown: (type) => type.name,
}

function writeKind<K extends keyof JSONOutput.TypeKindMap>(kind: K, type: JSONOutput.TypeKindMap[K]): string {
  return WRITERS[kind](type)
}

function writeType(type: SomeType | undefined): string {
  return type === undefined ? 'unknown' : writeKind(type.type, type)
}

function writeMemberType(member: Reflection): string {
  if (member.signatures !== undefined) return member.signatures.map(writeSignature).join(' & ')
  if (member.getSignature !== undefined) return writeType(member.getSignature.type)
  return writeType(member.type)
}

function simplify(member: Reflection, full: string): string {
  if (full.length <= SIMPLE_TYPE_LENGTH) return full
  if (member.signatures !== undefined) return 'function'
  const type = member.type
  if (type?.type === 'reflection') return type.declaration.signatures === undefined ? 'object' : 'function'
  if (type?.type === 'reference') return type.name
  if (type?.type === 'union') return 'union'
  return 'object'
}

function writeEntry(member: Reflection): DocEntry {
  const comment = member.comment ?? member.signatures?.[0]?.comment
  const type = writeMemberType(member)
  return {
    name: member.name,
    description: writeParts(comment?.summary),
    type,
    simplifiedType: simplify(member, type),
    tags: (comment?.blockTags ?? []).map((tag) => ({name: tag.tag.slice(1), text: writeParts(tag.content)})),
    required: member.flags.isOptional !== true,
    deprecated: comment?.blockTags?.some((tag) => tag.tag === '@deprecated') === true,
  }
}

export function createReferenceGenerator(): Generator {
  const require = createRequire(import.meta.url)
  const packages: PackageIndex[] = []
  const loaded = new Map<string, LoadedPackage>()

  function readIndex(): PackageIndex[] {
    if (packages.length === 0) {
      const index = readJson(require, 'index.json')
      if (!Array.isArray(index)) throw new Error('@internal/reference index.json is not a list')
      packages.push(...index)
    }
    return packages
  }

  function loadPackage(name: string): LoadedPackage {
    const cached = loaded.get(name)
    if (cached !== undefined) return cached
    const entry = readIndex().find((candidate) => candidate.name === name)
    if (entry === undefined) throw new Error(`${name} is not in @internal/reference`)
    const project: JSONOutput.ProjectReflection = JSON.parse(
      readFileSync(require.resolve(`@internal/reference/data/${entry.file}`), 'utf8'),
    )
    const byId = new Map<number, Reflection>()
    indexReflections(project, byId)
    const result = {project, byId}
    loaded.set(name, result)
    return result
  }

  function splitSpecifier(specifier: string): [string, string] {
    const owner = readIndex()
      .filter((entry) => specifier === entry.name || specifier.startsWith(`${entry.name}/`))
      .toSorted((a, b) => b.name.length - a.name.length)[0]
    if (owner === undefined) throw new Error(`no published package owns ${specifier}`)
    const rest = specifier.slice(owner.name.length)
    return [owner.name, rest === '' ? '.' : `.${rest}`]
  }

  function findBySymbol(packageName: string, symbol: JSONOutput.ReflectionSymbolId): Reflection | undefined {
    const {project, byId} = loadPackage(packageName)
    const match = Object.entries(project.symbolIdMap ?? {}).find(
      ([, id]) => id.qualifiedName === symbol.qualifiedName && id.packagePath === symbol.packagePath,
    )
    return match === undefined ? undefined : byId.get(Number(match[0]))
  }

  function resolveReference(packageName: string, type: JSONOutput.ReferenceType): [string, Reflection] | undefined {
    const target = type.target
    if (typeof target === 'number') {
      const found = loadPackage(packageName).byId.get(target)
      return found === undefined ? undefined : [packageName, found]
    }
    if (!readIndex().some((entry) => entry.name === target.packageName)) return undefined
    const found = findBySymbol(target.packageName, target)
    return found === undefined ? undefined : [target.packageName, found]
  }

  function readTypeMembers(packageName: string, type: SomeType | undefined): Reflection[] {
    if (type === undefined) return []
    if (type.type === 'reflection') return readMembers(packageName, type.declaration)
    if (type.type === 'intersection') return type.types.flatMap((part) => readTypeMembers(packageName, part))
    if (type.type === 'mapped') return readTypeMembers(packageName, type.templateType)
    if (type.type === 'indexedAccess') return readTypeMembers(packageName, type.objectType)
    if (type.type !== 'reference') return []
    if (type.package === 'typescript' && type.name === 'Omit') {
      const [base, keys] = type.typeArguments ?? []
      const omitted = keys === undefined ? [] : readLiteralKeys(keys)
      return readTypeMembers(packageName, base).filter((member) => !omitted.includes(member.name))
    }
    const resolved = resolveReference(packageName, type)
    return resolved === undefined ? [] : readMembers(...resolved)
  }

  function readMembers(packageName: string, reflection: Reflection): Reflection[] {
    if (reflection.flags.isExternal === true) return readTypeMembers(packageName, reflection.type)
    const children = (reflection.children ?? []).filter((child) => MEMBER_KINDS.includes(child.kind))
    return children.length > 0 ? children : readTypeMembers(packageName, reflection.type)
  }

  function findExport(packageName: string, subpath: string, name: string): Reflection {
    const {project} = loadPackage(packageName)
    const modules = (project.children ?? []).filter((child) => child.kind === 2)
    const scope = modules.length === 0 ? project : modules.find((module) => module.name === subpath)
    let found: Reflection | undefined
    let container: JSONOutput.ContainerReflection | undefined = scope
    for (const part of name.split('.')) {
      found = container?.children?.find((child) => child.name === part)
      container = found
      if (found?.flags.isExternal === true && found.type?.type === 'reference') {
        container = resolveReference(packageName, found.type)?.[1] ?? found
      }
    }
    if (found === undefined) throw new Error(`${packageName} ${subpath} has no export ${name}`)
    return found
  }

  async function generateTypeTable(props: {path?: string; name?: string}): Promise<GeneratedDoc[]> {
    const {path, name} = props
    if (path === undefined || name === undefined) throw new Error('a reference type table needs path and name')
    const [packageName, subpath] = splitSpecifier(path)
    const reflection = findExport(packageName, subpath, name)
    const members = readMembers(packageName, reflection)
    if (members.length === 0) throw new Error(`${path} ${name} has no members to list`)
    return [
      {
        id: `${path}-${name}`.replace(/[^a-z0-9]+/gi, '-'),
        name,
        description: writeParts(reflection.comment?.summary),
        entries: members.map(writeEntry),
      },
    ]
  }

  return {
    generateTypeTable,
    generateDocumentation: (file, name) => generateTypeTable({path: file.path, name}),
  }
}

function readLiteralKeys(type: SomeType): string[] {
  if (type.type === 'literal' && typeof type.value === 'string') return [type.value]
  if (type.type === 'union') return type.types.flatMap(readLiteralKeys)
  return []
}
