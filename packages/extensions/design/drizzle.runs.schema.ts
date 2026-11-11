import {runsViews} from './src/server/runs/views/index-of-views.js'
import {storeTables} from './src/server/runs/store-tables.js'

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
  nodes,
  tool_calls,
  runs,
  labels,
  notes,
  node_components,
  hints,
  artifacts,
} = storeTables

export const {
  run_summary,
  round_rows,
  hint_vs_drawn,
  kit_per_round,
  mispairs,
  lost_components,
  page_height_rows,
  broken_rounds,
  lowest_rendered,
  fom_nodes,
} = runsViews
