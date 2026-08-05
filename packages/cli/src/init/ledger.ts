export type StepStatus = 'done' | 'already' | 'manual' | 'skipped'

export type ManualCard = {title: string; body: string; snippet?: string}

export type StepNote = {title: string; body: string}

export type StepPlan = {summary: string; wouldEdit: string[]}

export type StepOutcome =
  | {status: 'done'}
  | {status: 'skipped'; detail?: string}
  | {status: 'manual'; cards: ManualCard[]; detail?: string}

export type LedgerEntry = {id: string; title: string; status: StepStatus; cards: ManualCard[]; detail?: string}
