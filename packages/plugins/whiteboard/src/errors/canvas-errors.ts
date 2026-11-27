import {defineErrorCatalog} from 'evlog'

export const canvasErrors = defineErrorCatalog('whiteboard.canvas', {
  NOT_ATTACHED: {
    message: ({scope}: {scope: string}) =>
      `[whiteboard] the canvas has not attached yet, so a ${scope} export has nothing to render`,
  },
  CONTAINER_DETACHED: {message: 'the canvas container never attached to the document'},
  REMOVE_FAILED: {message: ({id}: {id: string}) => `the pending row ${id} could not be removed`},
  SINCE_FAILED: {message: 'the change feed could not be read'},
  EVENTS_STOPPED: {message: 'the change events stopped'},
  ROW_MISSING: {status: 404, message: 'the row is gone'},
  ROWS_UNREADABLE: {message: 'the rows could not be read'},
  COMMENTS_UNBOUND: {
    message: 'the comments never bound, the comment was not added',
    fix: 'Open the chat for this page, then add the comment again.',
  },
  RUNTIME_MISSING: {message: 'useWhiteboardRuntime must be used inside a WhiteboardRuntimeProvider'},
  DB_MISSING: {message: 'useWhiteboardDb must be used inside a WhiteboardDbProvider'},
  COMMENTS_MISSING: {message: 'useComments must be used inside a CommentsProvider'},
})

declare module 'evlog' {
  interface RegisteredErrorCatalogs {
    'whiteboard.canvas': typeof canvasErrors
  }
}
