import {extensionTable} from '@conciv/db'
import {designTables} from './src/server/tables.js'

export const {
  targets,
  rounds,
  missing,
  candidates,
  widths,
  regions,
  rows,
  fom,
  votes,
  tool_calls,
  runs,
  labels,
  notes,
} = designTables(extensionTable('design'))
