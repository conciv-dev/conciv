import {defineErrorCatalog} from 'evlog'

export const toolErrors = defineErrorCatalog('whiteboard.tool', {
  COMMENT_NOT_FOUND: {
    status: 404,
    message: ({cid}: {cid: string}) => `comment ${cid} not found`,
    fix: 'List the comments again and use a cid from that list.',
  },
  PIN_NOT_FOUND: {
    status: 404,
    message: ({cid}: {cid: string}) => `no pin for comment ${cid}`,
    fix: 'List the comments again and use the cid of a comment pinned on the canvas.',
  },
  NO_CANVAS: {
    message: 'no canvas is open to draw into, so nothing was drawn',
    fix: 'ask the user to open the canvas from the Whiteboard pill above the composer, then draw again',
  },
  DRAW_UNFINISHED: {
    message:
      'the open canvas took the drawing but did not finish it in time, so it may be missing or only partly in the draft',
    fix: 'read the draft before drawing again',
  },
  DRAW_FAILED: {message: ({reason}: {reason: string}) => reason, why: 'The canvas could not convert the skeletons.'},
  INVALID_DIAGRAM: {message: ({reason}: {reason: string}) => reason, why: 'The canvas could not parse the diagram.'},
  INVALID_SVG: {message: ({reason}: {reason: string}) => reason, why: 'The svg markup was refused.'},
  DIAGRAM_TOO_LARGE: {
    status: 413,
    message: ({maxEdges}: {maxEdges: number}) => `diagram exceeds ${maxEdges} edges`,
    fix: 'Split the diagram into smaller diagrams.',
  },
  EXPORT_TIMEOUT: {
    message: 'export timed out: no canvas tab is connected (whiteboard_canvas_preview works without one)',
  },
  EXPORT_FAILED: {message: ({reason}: {reason: string}) => reason, why: 'The canvas tab could not render the export.'},
  COMMIT_TIMEOUT: {
    message: 'commit timed out: no canvas tab is connected to perform it',
    fix: 'Ask the user to open the canvas, then publish the draft again.',
  },
  RENDER_FAILED: {message: ({reason}: {reason: string}) => `the draft could not be rendered: ${reason}`},
  PENDING_STOPPED: {
    message: ({state}: {state: string}) => `the pending machine stopped in ${state}`,
    why: 'The pending machine reached a state with no next step.',
  },
})

declare module 'evlog' {
  interface RegisteredErrorCatalogs {
    'whiteboard.tool': typeof toolErrors
  }
}
