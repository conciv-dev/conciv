import type {FileBackup} from '../../../src/init/interrupt.js'
import type {StepNote} from '../../../src/init/ledger.js'
import type {InitContext, RunSettings} from '../../../src/init/pipeline.js'
import type {InitOutput} from '../../../src/init/wizard.js'
import {recorderOutput} from '../../support/init-output.js'

export type StepHarness = {
  reports: string[]
  notes: StepNote[]
  backups: FileBackup[]
  events: string[]
  output: InitOutput
  ctx: InitContext
  settings: RunSettings
}

export function stepContext(cwd: string): StepHarness {
  const reports: string[] = []
  const notes: StepNote[] = []
  const backups: FileBackup[] = []
  const ctx: InitContext = {
    cwd,
    yes: true,
    dryRun: false,
    report: (line) => reports.push(line),
    note: (note) => notes.push(note),
    backup: (file) => backups.push(file),
    feed: () => {},
  }
  const settings: RunSettings = {cwd, yes: true, dryRun: false, backup: ctx.backup, interrupt: () => () => {}}
  const events: string[] = []
  return {reports, notes, backups, events, output: recorderOutput(events), ctx, settings}
}
