import {integer, primaryKey, sqliteTable, text} from 'drizzle-orm/sqlite-core'

export const engines = sqliteTable('engines', {
  id: text('id').primaryKey(),
  pid: integer('pid').notNull(),
  root: text('root').notNull(),
  apiBase: text('api_base').notNull(),
  deletedAt: integer('deleted_at'),
})

export const hubRevocations = sqliteTable('hub_revocations', {
  generation: integer('generation').primaryKey({autoIncrement: true}),
})

export const hubOperations = sqliteTable('hub_operations', {
  harness: text('harness').primaryKey(),
  pid: integer('pid').notNull(),
  childPid: integer('child_pid'),
  startedAt: integer('started_at').notNull(),
})

export const hubConnections = sqliteTable('hub_connections', {
  harness: text('harness').primaryKey(),
  connectedAt: integer('connected_at').notNull(),
})

export const components = sqliteTable(
  'components',
  {
    project: text('project').notNull(),
    tree: text('tree').notNull(),
    id: text('id').notNull(),
    names: text('names', {mode: 'json'}).$type<string[]>().notNull(),
    file: text('file').notNull(),
    pkg: text('pkg'),
    version: text('version'),
    specifier: text('specifier').notNull(),
    renders: integer('renders', {mode: 'boolean'}).notNull(),
    sentence: text('sentence'),
    props: text('props', {mode: 'json'}).$type<unknown>().notNull(),
    usage: text('usage'),
    story: text('story'),
    lines: text('lines', {mode: 'json'}).$type<{start: number; end: number}>().notNull(),
    imports: integer('imports').notNull(),
    previewError: text('preview_error'),
    scannedAt: integer('scanned_at').notNull(),
  },
  (self) => [primaryKey({columns: [self.project, self.tree, self.id]})],
)

export const componentSites = sqliteTable('component_sites', {
  seq: integer('seq').primaryKey({autoIncrement: true}),
  project: text('project').notNull(),
  tree: text('tree').notNull(),
  componentId: text('component_id').notNull(),
  file: text('file').notNull(),
  line: integer('line').notNull(),
})

export const componentScans = sqliteTable('component_scans', {
  seq: integer('seq').primaryKey({autoIncrement: true}),
  project: text('project').notNull(),
  tree: text('tree').notNull(),
  fingerprint: text('fingerprint').notNull(),
  modules: integer('modules').notNull(),
  components: integer('components').notNull(),
  at: integer('at').notNull(),
})

export const componentFlags = sqliteTable(
  'component_flags',
  {
    project: text('project').notNull(),
    componentId: text('component_id').notNull(),
    flag: text('flag', {enum: ['prefer', 'do-not-use']}).notNull(),
    at: integer('at').notNull(),
  },
  (self) => [primaryKey({columns: [self.project, self.componentId]})],
)
