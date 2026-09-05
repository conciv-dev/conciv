import {createHash} from 'node:crypto'
import {existsSync, mkdirSync, readFileSync, watch} from 'node:fs'
import {basename, dirname, join} from 'node:path'
import {loadConfig} from 'c12'
import {applyEdits, modify, parse, printParseErrorCode, type ParseError} from 'jsonc-parser'
import writeFileAtomic from 'write-file-atomic'
import {z} from 'zod'
import type {SettingsLayerFormat} from '@conciv/protocol/settings-types'

export type LayerEdit = {keyPath: readonly string[]; value: unknown}

export type LayerSnapshot = {
  path: string
  format: SettingsLayerFormat
  text: string
  revision: string
  data: Record<string, unknown> | null
  parseError: string | null
  warning: string | null
}

export const JSONC_FILE = 'settings.jsonc'
export const JSON_FILE = 'settings.json'
export const SETTINGS_FILE_NAMES = [JSONC_FILE, JSON_FILE]

const FORMATTING_OPTIONS = {insertSpaces: true, tabSize: 2, eol: '\n'}
const STRICT_JSON_OPTIONS = {allowTrailingComma: false, disallowComments: true}
const TOLERANT_JSONC_OPTIONS = {allowTrailingComma: true, disallowComments: false}
const LayerObjectSchema = z.record(z.string(), z.unknown())

function revisionOf(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 16)
}

export const EMPTY_REVISION = revisionOf('')

function readText(path: string): string {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return ''
  }
}

function malformedReason(text: string, format: SettingsLayerFormat): string | null {
  const errors: ParseError[] = []
  parse(text, errors, format === 'jsonc' ? TOLERANT_JSONC_OPTIONS : STRICT_JSON_OPTIONS)
  const first = errors[0]
  if (first === undefined) return null
  const line = text.slice(0, first.offset).split('\n').length
  return `${printParseErrorCode(first.error)} at line ${line}`
}

async function loadThroughC12(path: string): Promise<Record<string, unknown> | null> {
  try {
    const loaded = await loadConfig({
      cwd: dirname(path),
      name: 'settings',
      configFile: basename(path),
      rcFile: false,
      globalRc: false,
      packageJson: false,
      dotenv: false,
      giget: false,
      envName: false,
      extend: false,
    })
    const object = LayerObjectSchema.safeParse(loaded.config)
    return object.success ? object.data : null
  } catch {
    return null
  }
}

function bothPresentWarning(directory: string): string {
  return `both ${JSONC_FILE} and ${JSON_FILE} exist in ${directory}; ${JSONC_FILE} is honored and ${JSON_FILE} is ignored`
}

export function honoredFile(directory: string): {path: string; format: SettingsLayerFormat; warning: string | null} {
  const jsonc = join(directory, JSONC_FILE)
  const plain = join(directory, JSON_FILE)
  const hasJsonc = existsSync(jsonc)
  const hasPlain = existsSync(plain)
  if (hasJsonc && hasPlain) return {path: jsonc, format: 'jsonc', warning: bothPresentWarning(directory)}
  if (hasJsonc) return {path: jsonc, format: 'jsonc', warning: null}
  if (hasPlain) return {path: plain, format: 'json', warning: null}
  return {path: jsonc, format: 'absent', warning: null}
}

export async function readLayer(directory: string): Promise<LayerSnapshot> {
  const honored = honoredFile(directory)
  const text = readText(honored.path)
  const revision = revisionOf(text)
  const base = {path: honored.path, format: honored.format, text, revision, warning: honored.warning}
  if (text.trim() === '') return {...base, data: {}, parseError: null}
  const malformed = malformedReason(text, honored.format)
  if (malformed !== null) return {...base, data: null, parseError: malformed}
  const data = await loadThroughC12(honored.path)
  if (data === null) return {...base, data: null, parseError: 'the settings file must hold a JSON object'}
  return {...base, data, parseError: null}
}

export async function writeLayer(
  directory: string,
  snapshot: LayerSnapshot,
  edits: readonly LayerEdit[],
): Promise<LayerSnapshot> {
  const text = edits.reduce(
    (current, edit) =>
      applyEdits(current, modify(current, [...edit.keyPath], edit.value, {formattingOptions: FORMATTING_OPTIONS})),
    snapshot.text.trim() === '' ? '{}\n' : snapshot.text,
  )
  mkdirSync(directory, {recursive: true})
  writeFileAtomic.sync(snapshot.path, text, {encoding: 'utf8', fsync: true})
  return readLayer(directory)
}

export function watchLayers(directories: readonly string[], onChange: () => void, debounceMs: number): () => void {
  const timer: {handle: ReturnType<typeof setTimeout> | null} = {handle: null}
  const schedule = (): void => {
    if (timer.handle !== null) clearTimeout(timer.handle)
    timer.handle = setTimeout(onChange, debounceMs)
  }
  const watchers = directories.map((directory) => {
    mkdirSync(directory, {recursive: true})
    return watch(directory, (_event, changed) => {
      if (changed === null || SETTINGS_FILE_NAMES.includes(changed)) schedule()
    })
  })
  return () => {
    if (timer.handle !== null) clearTimeout(timer.handle)
    for (const watcher of watchers) watcher.close()
  }
}
