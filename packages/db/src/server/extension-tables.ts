import {createHash} from 'node:crypto'
import {stateError} from '../errors.js'
import {extensionTableName, ExtensionTableSpecSchema, type ExtensionTableSpec} from '../table-names.js'

export {extensionTableName, ExtensionTableSpecSchema, type ExtensionTableSpec} from '../table-names.js'

const FORBIDDEN_COLUMN_TOKENS = [';', '--', '/*']

function assertColumns(spec: ExtensionTableSpec): string {
  const columns = spec.columns.trim()
  if (!columns) throw stateError('invalid-table', `extension table ${spec.name} declares no columns`, {spec})
  const forbidden = FORBIDDEN_COLUMN_TOKENS.filter((token) => columns.includes(token))
  if (forbidden.length > 0) {
    throw stateError('invalid-table', `extension table ${spec.name} columns contain ${forbidden.join(' ')}`, {
      spec,
      forbidden,
    })
  }
  return columns
}

export function extensionTableSql(spec: ExtensionTableSpec): string {
  const columns = assertColumns(ExtensionTableSpecSchema.parse(spec))
  return `CREATE TABLE ${extensionTableName(spec)} (
  id BLOB PRIMARY KEY NOT NULL CHECK(is_uuid_v7(id)) DEFAULT (uuid_v7()),
  ${columns}
) STRICT;
`
}

function migrationVersion(physical: string): number {
  const digest = createHash('sha256').update(physical).digest()
  return 1790000000 + (digest.readUInt32BE(0) % 100000000)
}

export function extensionMigrationFilename(spec: ExtensionTableSpec): string {
  const physical = extensionTableName(spec)
  return `U${migrationVersion(physical)}__${physical}.sql`
}
