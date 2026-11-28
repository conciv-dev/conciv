import {TypeTable, type TypeNode} from 'fumadocs-ui/components/type-table'
import commands from '@internal/reference/data/commands.json'
import harnessList from '@internal/reference/data/harnesses.json'

type Param = {kind?: string; label?: string; description?: string}

function readParam({kind, label, description}: Param): [string, TypeNode][] {
  return label === undefined ? [] : [[label, {type: kind, description}]]
}

export function CliCommands() {
  return commands.flatMap((command) => {
    const params = command.params.flatMap(readParam)
    if (!command.runs && params.length === 0) return []
    return [
      <section key={command.path}>
        <h3>
          <code>{command.path}</code>
        </h3>
        <p>{command.description}</p>
        {params.length > 0 && <TypeTable type={Object.fromEntries(params)} />}
      </section>,
    ]
  })
}

const CAPABILITY_LABELS = [
  ['transcriptHistory', 'Its sessions in the session list'],
  ['slashCommands', '/ commands from the CLI'],
  ['imageInput', 'Image attachments'],
  ['permissionGate', 'Permission cards'],
  ['compaction', 'Its own /compact'],
] as const

type Harness = (typeof harnessList)[number]

function writeCapability(value: string | boolean) {
  return value === false || value === 'none' ? 'no' : 'yes'
}

function writeModels(harness: Harness) {
  return 'models' in harness && Array.isArray(harness.models) ? harness.models.join(', ') : 'read from the CLI'
}

export function HarnessTable() {
  return (
    <table>
      <thead>
        <tr>
          <th />
          {harnessList.map((harness) => (
            <th key={harness.id}>{harness.name}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>
            <code>harness</code>
          </td>
          {harnessList.map((harness) => (
            <td key={harness.id}>
              <code>{harness.id}</code>
            </td>
          ))}
        </tr>
        <tr>
          <td>CLI on your PATH</td>
          {harnessList.map((harness) => (
            <td key={harness.id}>
              <code>{harness.bin}</code>
            </td>
          ))}
        </tr>
        <tr>
          <td>Models in the menu</td>
          {harnessList.map((harness) => (
            <td key={harness.id}>{writeModels(harness)}</td>
          ))}
        </tr>
        {CAPABILITY_LABELS.map(([key, label]) => (
          <tr key={key}>
            <td>{label}</td>
            {harnessList.map((harness) => (
              <td key={harness.id}>{writeCapability(harness.capabilities[key])}</td>
            ))}
          </tr>
        ))}
        <tr>
          <td>Terminal tab</td>
          {harnessList.map((harness) => (
            <td key={harness.id}>{writeCapability(harness.terminal)}</td>
          ))}
        </tr>
      </tbody>
    </table>
  )
}
