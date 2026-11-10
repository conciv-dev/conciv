import {defineRelations} from 'drizzle-orm'
import {storeTables} from './store-tables.js'

export const runsRelations = defineRelations(storeTables, (r) => {
  const ofRun = (table: Child) => r.one.runs({from: r[table].run_id, to: r.runs.run_id, optional: false})
  const ofTarget = (table: Child) =>
    r.one.targets({
      from: [r[table].run_id, r[table].target_id],
      to: [r.targets.run_id, r.targets.target_id],
      optional: false,
    })
  const ofRound = (table: Rounded) =>
    r.one.rounds({
      from: [r[table].run_id, r[table].target_id, r[table].round],
      to: [r.rounds.run_id, r.rounds.target_id, r.rounds.round],
    })
  const child = (table: Child) => ({run: ofRun(table), target: ofTarget(table)})
  const rounded = (table: Rounded) => ({...child(table), roundRow: ofRound(table)})
  return {
    runs: {
      targets: r.many.targets(),
      rounds: r.many.rounds(),
      toolCalls: r.many.tool_calls(),
      labels: r.many.labels(),
      notes: r.many.notes(),
      artifacts: r.many.artifacts(),
      judgements: r.many.judgements(),
    },
    targets: {
      run: r.one.runs({from: r.targets.run_id, to: r.runs.run_id, optional: false}),
      rounds: r.many.rounds(),
      nodes: r.many.nodes(),
      fom: r.many.fom(),
    },
    rounds: {
      ...child('rounds'),
      rows: r.many.rows(),
      missing: r.many.missing(),
      candidates: r.many.candidates(),
      widths: r.many.widths(),
      regions: r.many.regions(),
      votes: r.many.votes(),
      fom: r.many.fom(),
      nodeComponents: r.many.node_components(),
    },
    rows: rounded('rows'),
    missing: rounded('missing'),
    candidates: rounded('candidates'),
    widths: rounded('widths'),
    regions: rounded('regions'),
    votes: rounded('votes'),
    fom: rounded('fom'),
    node_components: rounded('node_components'),
    tool_calls: {
      run: ofRun('tool_calls'),
      target: r.one.targets({
        from: [r.tool_calls.run_id, r.tool_calls.target_id],
        to: [r.targets.run_id, r.targets.target_id],
      }),
    },
    labels: child('labels'),
    notes: child('notes'),
    nodes: child('nodes'),
    artifacts: {run: r.one.runs({from: r.artifacts.run_id, to: r.runs.run_id})},
    lanes: {run: r.one.runs({from: r.lanes.run_id, to: r.runs.run_id, optional: false})},
    judgements: {run: ofRun('judgements')},
    reports: {artifact: r.one.artifacts({from: r.reports.artifact_id, to: r.artifacts.artifact_id})},
  }
})

type Child = Exclude<keyof typeof storeTables, 'runs' | 'targets' | 'artifacts' | 'lanes' | 'reports'>

type Rounded = Exclude<Child, 'nodes' | 'judgements'>
