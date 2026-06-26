import {MessageSquarePlus, Presentation} from 'lucide-solid'
import type {ExtComposerAction} from '@mandarax/extensions'

// The user-facing entry to the canvas: toggles the whiteboard effect on/off.
export const makeWhiteboardAction = (toggle: () => void): ExtComposerAction => ({
  id: 'whiteboard-canvas',
  label: 'Open the whiteboard canvas',
  icon: Presentation,
  onClick: () => toggle(),
})

const centerOf = (rect: {x: number; y: number; width: number; height: number} | null): {x: number; y: number} =>
  rect ? {x: rect.x + rect.width / 2, y: rect.y + rect.height / 2} : {x: 24, y: 24}

// Pick an element, then pin a source-linked comment at it. Source is {file:line:col} only here; the
// drift doctor (Phase 4) enriches it with an AST hash + snippet. A pick with no source degrades to a
// floating comment rather than silently dropping the note.
export const commentAction: ExtComposerAction = {
  id: 'whiteboard-comment',
  label: 'Comment on an element',
  icon: MessageSquarePlus,
  onClick: (ctx) =>
    ctx.pick((result) => {
      const {x, y} = centerOf(result.rect)
      const source = result.source
      void ctx.runTool('comment.create', {
        cid: crypto.randomUUID(),
        kind: source ? 'source-linked' : 'floating',
        parts: [{type: 'text', text: result.text}],
        anchor: source ? {source} : undefined,
        x,
        y,
        author_kind: 'human',
      })
    }),
}
