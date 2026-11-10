import {runsViews} from './src/server/views.js'
import {runsTables} from './src/server/runs-tables.js'

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
} = runsTables

export const {run_summary, round_rows, hint_vs_drawn, kit_per_round, mispairs, lost_components} = runsViews
