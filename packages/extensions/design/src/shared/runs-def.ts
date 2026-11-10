import {z} from 'zod'
import {designTool} from './design-tool.js'

const VIEWS = [
  'run_summary: per run and width the last round: run_id, model, cost, minutes, run_verdict, target_id, width, round, verdict, rows, much, noticeably, slightly, reflow, paint, pixels, and checks, the design_check calls before the run ended',
  'round_rows: run_id, target_id, round, kind, magnitude and the count of rows of that kind',
  'hint_vs_drawn: per round each node design_get hinted: run_id, target_id, round, node, hint, hint_specifier, drawn (the component the relation says rendered it) and same (1 when drawn is the hint)',
  'kit_per_round: run_id, target_id, round, component_id, component, specifier and the nodes it rendered',
  'mispairs: a node whose winning element changed between rounds by a vote margin under the pair margin: run_id, target_id, node, first_round, first_path, round, before, path, margin',
  'lost_components: the component rows: run_id, target_id, round, node, component, specifier',
]

const SUMMARY = `Answers one read-only SQL statement over every imported run (runs.db beside home.db) and returns the column names and the rows; params fill the ? placeholders; add LIMIT and select only the columns you need, design_tool_calls.reply holds whole replies. Tables: the design tables keyed by run_id (design_runs, design_targets, design_rounds, design_rows, design_votes, design_fom, design_nodes, design_missing, design_candidates, design_widths, design_regions, design_tool_calls, design_labels, design_notes, design_node_components). Views: ${VIEWS.join('; ')}.`

export const runsDef = designTool({
  name: 'design_runs',
  summary: SUMMARY,
  running: 'Querying the stored runs',
  done: 'Queried the stored runs',
  input: z.object({
    sql: z.string().min(1).describe('one SELECT statement'),
    params: z
      .array(z.union([z.string(), z.number(), z.null()]))
      .optional()
      .describe('the values of its ? placeholders'),
  }),
  output: z.object({columns: z.array(z.string()), rows: z.array(z.record(z.string(), z.unknown()))}),
  keywords: ['design', 'runs', 'sql', 'query'],
  positional: 'sql',
})
