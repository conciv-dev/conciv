import {isAbsolute, relative} from 'node:path'
import {Effect, FileSystem} from 'effect'
import MagicString from 'magic-string'
import type {JSXOpeningElement} from 'oxc-parser'
import {
  KEY_ATTRIBUTE,
  SITE_ATTRIBUTE,
  calledComponent,
  hostElement,
  insertAt,
  literalKey,
  makeLocator,
  parseModule,
  readAttribute,
} from './jsx-openings.js'
import type {Locate, Parsed} from './jsx-openings.js'
import {carriedKeys, mintKey, readOpenings} from './key-map.js'
import type {KeyMap} from './key-map.js'
import {designErrors} from '../errors/errors.js'

const JSX_EXTENSIONS = ['.jsx', '.tsx']

type Disk = {readonly text: string; readonly openings: JSXOpeningElement[]; readonly locate: Locate}

type Stamp = {readonly index: number; readonly node: JSXOpeningElement; readonly key: string | null}

export function stampJsx(input: {keys: KeyMap; root: string; code: string; id: string}) {
  return Effect.gen(function* () {
    const file = input.id.split('?')[0] ?? input.id
    if (!JSX_EXTENSIONS.some((extension) => file.endsWith(extension))) return null
    const parsed = yield* parseModule(file, input.code).pipe(Effect.orElseSucceed(() => null))
    if (parsed === null || parsed.openings.length === 0) return null
    const disk = yield* readDisk(file, parsed.openings.length)
    return stampParsed({...input, file, parsed, disk})
  })
}

function stampParsed(input: {
  keys: KeyMap
  root: string
  code: string
  file: string
  parsed: Parsed
  disk: Disk | null
}) {
  const {keys, root, code, file, parsed, disk} = input
  const relativePath = inside(root, file) ? relative(root, file) : file
  const sites = parsed.openings.flatMap((node, index) =>
    calledComponent(node, parsed.imported) ? [{node, index}] : [],
  )
  const now = disk === null ? [] : readOpenings(disk.text, disk.openings)
  const carried = carriedKeys(keys.get(file), now)
  const stamps = parsed.openings.flatMap((node, index): Stamp[] => {
    if (!hostElement(node.name)) return []
    if (readAttribute(node, KEY_ATTRIBUTE) !== undefined) return [{index, node, key: null}]
    const key =
      literalKey(disk?.openings[index]) ??
      carried.get(index) ??
      mintKey({relativePath, index, text: disk?.text ?? code})
    return [{index, node, key}]
  })
  if (stamps.length === 0 && sites.length === 0) return null
  if (disk !== null) {
    const served = now.map((_opening, index) => stamps.find((stamp) => stamp.index === index)?.key ?? null)
    keys.set(file, {openings: now, keys: served})
  }
  const minted = stamps.filter((stamp) => stamp.key !== null)
  if (minted.length === 0 && sites.length === 0) return null
  const locate = makeLocator(code)
  const magic = new MagicString(code)
  minted.forEach((stamp) => magic.appendLeft(insertAt(stamp.node), ` ${KEY_ATTRIBUTE}=${JSON.stringify(stamp.key)}`))
  sites.forEach((site) => {
    const placed = disk?.openings[site.index]
    const line = placed === undefined || disk === null ? locate(site.node.start) : disk.locate(placed.start)
    magic.appendLeft(insertAt(site.node), ` ${SITE_ATTRIBUTE}=${JSON.stringify(`${relativePath}:${line}`)}`)
  })
  return {code: magic.toString(), map: magic.generateMap({source: file, hires: true})}
}

function readDisk(file: string, expected: number) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const text = yield* fs.readFileString(file).pipe(
      Effect.catchReason('PlatformError', 'NotFound', () => Effect.succeed(null)),
      Effect.mapError((cause) => designErrors.UNREADABLE({file, detail: cause.message, cause})),
    )
    if (text === null) return null
    const parsed = yield* parseModule(file, text).pipe(Effect.orElseSucceed(() => null))
    if (parsed === null || parsed.openings.length !== expected) return null
    const disk: Disk = {text, openings: parsed.openings, locate: makeLocator(text)}
    return disk
  })
}

function inside(root: string, file: string): boolean {
  const path = relative(root, file)
  return path !== '' && !path.startsWith('..') && !isAbsolute(path)
}
