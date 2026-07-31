import type {DraftRow} from '@conciv/contract'
import type {PaneSnapshot} from '../lib/ui-snapshot.js'

export type RestoreTargets = {input: HTMLTextAreaElement | undefined; viewport: HTMLElement | undefined}

export function stageRestoredDraft(
  row: DraftRow | null | undefined,
  setText: (value: string) => void,
  stageTexts: (texts: string[]) => void,
): void {
  if (!row) return
  setText(row.text)
  if (row.grabs.length > 0) stageTexts(row.grabs)
}

export function focusedInside(element: HTMLElement | undefined): boolean {
  if (!element) return false
  const root = element.getRootNode()
  if (root instanceof ShadowRoot) return root.activeElement === element
  return document.activeElement === element
}

export function applyRestoredDraft(
  row: DraftRow | null | undefined,
  snapshot: PaneSnapshot | null,
  targets: RestoreTargets,
): void {
  if (snapshot?.scrollTop != null && targets.viewport) targets.viewport.scrollTop = snapshot.scrollTop
  const input = targets.input
  if (!input) return
  if (row) input.setSelectionRange(row.selectionStart, row.selectionEnd)
  if (snapshot?.focused ?? true) input.focus()
}
