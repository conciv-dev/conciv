import {existsSync} from 'node:fs'
import {readFile, writeFile} from 'node:fs/promises'
import {basename, join} from 'node:path'

export type FakeCliScript = {stdout?: readonly string[]; stderr?: readonly string[]; exitCode?: number}

export type FakeCliCommand = {path: string; calls: () => Promise<string[][]>}

export type FakeCli = {bin: string; add: (name: string, script?: FakeCliScript) => Promise<FakeCliCommand>}

const ARGUMENT_END = '\0'
const CALL_END = '\u001e'

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`
}

function printLines(lines: readonly string[], stream: '' | ' >&2'): string[] {
  if (lines.length === 0) return []
  return [`printf '%s\\n' ${lines.map(shellQuote).join(' ')}${stream}`]
}

function shimScript(log: string, script: FakeCliScript): string {
  return [
    '#!/bin/sh',
    `for argument in "$@"; do printf '%s\\0' "$argument" >> ${shellQuote(log)}; done`,
    `printf '\\036' >> ${shellQuote(log)}`,
    ...printLines(script.stdout ?? [], ''),
    ...printLines(script.stderr ?? [], ' >&2'),
    `exit ${script.exitCode ?? 0}`,
    '',
  ].join('\n')
}

function readCalls(recorded: string): string[][] {
  return recorded
    .split(CALL_END)
    .slice(0, -1)
    .map((call) => call.split(ARGUMENT_END).slice(0, -1))
}

export function createFakeCli(bin: string): FakeCli {
  return {
    bin,
    add: async (name, script = {}) => {
      if (name === '' || basename(name) !== name) throw new Error(`a fake CLI name is one file name, not ${name}`)
      if (!Number.isInteger(script.exitCode ?? 0)) throw new Error(`a fake CLI exit code is an integer`)
      const path = join(bin, name)
      const log = join(bin, `.${name}.calls`)
      await writeFile(path, shimScript(log, script), {mode: 0o755})
      return {
        path,
        calls: async () => (existsSync(log) ? readCalls(await readFile(log, 'utf8')) : []),
      }
    },
  }
}
