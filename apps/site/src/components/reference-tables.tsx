import {TypeTable, type TypeNode} from 'fumadocs-ui/components/type-table'
import reference from '../../.reference/reference.json'

type Command = (typeof reference.cli)[number]

function readParam(param: Command['params'][number]): [string, TypeNode] {
  return [param.label, {type: param.kind, description: param.description}]
}

export function CliCommands() {
  return reference.cli
    .filter((command) => command.runs || command.params.length > 0)
    .map((command) => (
      <section key={command.path}>
        <h3>
          <code>{command.path}</code>
        </h3>
        <p>{command.description}</p>
        {command.params.length > 0 && <TypeTable type={Object.fromEntries(command.params.map(readParam))} />}
      </section>
    ))
}

const CAPABILITY_LABELS = [
  ['transcriptHistory', 'Its sessions in the session list'],
  ['slashCommands', '/ commands from the CLI'],
  ['imageInput', 'Image attachments'],
  ['permissionGate', 'Permission cards'],
  ['compaction', 'Its own /compact'],
] as const

type Harness = (typeof reference.harnesses)[number]

function writeCapability(value: string | boolean) {
  return value === false || value === 'none' ? 'no' : 'yes'
}

function writeModels(harness: Harness) {
  return 'models' in harness && Array.isArray(harness.models) ? harness.models.join(', ') : 'read from the CLI'
}

export function HarnessTable() {
  const harnesses = reference.harnesses
  return (
    <table>
      <thead>
        <tr>
          <th />
          {harnesses.map((harness) => (
            <th key={harness.id}>{harness.name}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>
            <code>harness</code>
          </td>
          {harnesses.map((harness) => (
            <td key={harness.id}>
              <code>{harness.id}</code>
            </td>
          ))}
        </tr>
        <tr>
          <td>CLI on your PATH</td>
          {harnesses.map((harness) => (
            <td key={harness.id}>
              <code>{harness.bin}</code>
            </td>
          ))}
        </tr>
        <tr>
          <td>Models in the menu</td>
          {harnesses.map((harness) => (
            <td key={harness.id}>{writeModels(harness)}</td>
          ))}
        </tr>
        {CAPABILITY_LABELS.map(([key, label]) => (
          <tr key={key}>
            <td>{label}</td>
            {harnesses.map((harness) => (
              <td key={harness.id}>{writeCapability(harness.capabilities[key])}</td>
            ))}
          </tr>
        ))}
        <tr>
          <td>Terminal tab</td>
          {harnesses.map((harness) => (
            <td key={harness.id}>{writeCapability(harness.terminal)}</td>
          ))}
        </tr>
      </tbody>
    </table>
  )
}
