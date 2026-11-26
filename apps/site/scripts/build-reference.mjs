import {mkdirSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {ConfigProvider} from 'effect'
import {main} from '@conciv/cli/commands'
import {harnessRegistry} from '@conciv/harness'

function readParams(route) {
  return route.phases.flatMap((phase) =>
    Object.values(phase.model.params).map((param) => ({
      name: param.name,
      kind: param.cli.syntax.type,
      label: param.cli.syntax.label,
      description: param.description,
    })),
  )
}

function isInherited(param, inherited) {
  return inherited.some((parent) => parent.name === param.name && parent.description === param.description)
}

function collectCommands(route, path, inherited) {
  const params = readParams(route)
  const own = params.filter((param) => !isInherited(param, inherited))
  const children = route.phases.flatMap((phase) => phase.routes)
  const entry = {
    path: path.join(' '),
    description: route.description ?? '',
    runs: route.methods.includes('execute'),
    params: own,
  }
  return [
    entry,
    ...children.flatMap((child) => collectCommands(child, [...path, child.name], [...inherited, ...params])),
  ]
}

function readHarnesses() {
  return harnessRegistry(ConfigProvider.fromUnknown({}))
    .list()
    .map((adapter) => ({
      id: adapter.id,
      name: adapter.displayName ?? adapter.id,
      bin: adapter.binName,
      capabilities: adapter.capabilities,
      terminal: adapter.tty !== undefined,
      models: Array.isArray(adapter.models) ? adapter.models.map((model) => model.id) : undefined,
    }))
}

const outDir = fileURLToPath(new URL('../.reference', import.meta.url))
const reference = {cli: collectCommands(main, [main.name], []), harnesses: readHarnesses()}
mkdirSync(outDir, {recursive: true})
writeFileSync(join(outDir, 'reference.json'), JSON.stringify(reference, null, 2))
