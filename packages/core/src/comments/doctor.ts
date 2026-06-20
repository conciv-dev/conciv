import type {CommentStore} from './comment-store.js'
import type {AnchorResolver, Anchor} from '../anchor/resolver.js'
import type {CanvasRelay} from '../canvas/relay.js'

export type DoctorReport = {fresh: number; reAnchored: number; drifted: number; orphaned: number; ambiguous: number}

// The re-anchor sweep: per source-linked comment, run resolver.resolve() and map the result.
// fresh -> no-op · moved -> re-anchor (keep open) · drifted/ambiguous -> flag drifted · orphaned ->
// mark orphaned. Floating comments are skipped (sourceless != orphaned). Also reconciles the
// commentId join: a pin with no row is dropped. Source resolution is session-agnostic (source is
// shared across sessions); pin reconcile is for the active session. Errors on one comment never abort
// the sweep. Incrementality (content-hash skip) is deferred — this re-resolves every sweep.
export type Doctor = {run: () => Promise<DoctorReport>}

export function createDoctor(deps: {
  comments: CommentStore
  resolver: AnchorResolver
  relay: CanvasRelay
  sessionId: () => string
}): Doctor {
  return {
    run: async () => {
      const report: DoctorReport = {fresh: 0, reAnchored: 0, drifted: 0, orphaned: 0, ambiguous: 0}
      const all = deps.comments.list({})
      for (const c of all) {
        if (c.kind !== 'source-linked') continue
        const anchor = c.anchor as Anchor | null
        if (!anchor?.hash) continue
        try {
          const res = await deps.resolver.resolve(anchor)
          if (res.status === 'fresh') report.fresh++
          else if (res.status === 'moved' && res.anchor) {
            deps.comments.setAnchor(c.id, res.anchor)
            report.reAnchored++
          } else if (res.status === 'ambiguous') {
            deps.comments.setStatus(c.id, 'drifted')
            report.ambiguous++
          } else if (res.status === 'drifted') {
            deps.comments.setStatus(c.id, 'drifted')
            report.drifted++
          } else if (res.status === 'orphaned') {
            deps.comments.setStatus(c.id, 'orphaned')
            report.orphaned++
          }
        } catch {
          // a resolver failure on one comment never throws the whole sweep
        }
      }
      const rows = new Set(all.map((c) => c.id))
      for (const pin of await deps.relay.pins(deps.sessionId())) {
        if (!rows.has(pin.commentId)) await deps.relay.deletePin(deps.sessionId(), pin.commentId)
      }
      return report
    },
  }
}

// Human-readable one-liner for the CLI.
export function formatReport(r: DoctorReport): string {
  return `${r.fresh} fresh · ${r.reAnchored} re-anchored · ${r.drifted + r.ambiguous} drifted (review) · ${r.orphaned} orphaned`
}
