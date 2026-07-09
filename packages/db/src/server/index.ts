export {ensureTrailBinary, TRAILBASE_VERSION} from './binary.js'
export {startTrailBase} from './lifecycle.js'
export {prepareDepot, MIGRATION_FILENAME, MIGRATION_SQL, BASE_CONFIG, RECORD_API_CONFIG} from './depot.js'
export {recordsClient, type RecordsClient, type ExtensionRecords} from './records.js'
export {
  extensionTableSql,
  extensionMigrationFilename,
  extensionTableName,
  ExtensionTableSpecSchema,
  type ExtensionTableSpec,
} from './extension-tables.js'
export {createTrailBaseSessionStore, type SessionStore} from './session-store.js'
export {startStatePlane, type StatePlane} from './plane.js'
export {stateError, isStateError, type StateError, type StateErrorCode} from '../errors.js'
