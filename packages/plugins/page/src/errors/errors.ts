import {defineErrorCatalog} from 'evlog'
import {PAGE_QUEUE_STOPPED_MESSAGE} from '../page-types.js'

export const pageErrors = defineErrorCatalog('page', {
  TAB_GONE_BEFORE_DISPATCH: {
    message: 'The page tab went away before the action was sent',
    why: 'The tab closed or reloaded while the action waited to be sent.',
    fix: 'List the open tabs again and retry the action on a tab from that list.',
  },
  TAB_GONE_AFTER_DISPATCH: {
    message: 'The page tab went away after the action was sent',
    why: 'The tab closed or reloaded while the action ran, so it may already have run.',
    fix: 'Inspect the page once it is open again before you repeat the action.',
  },
  QUEUE_NOT_FOUND: {
    status: 404,
    message: ({queueId}: {queueId: string}) => `No queue ${queueId} on this tab`,
    why: 'The queue finished long ago, was cancelled with its session, or never started.',
    fix: 'Start the queue again and use the id it returns.',
  },
  OPERATION_UNKNOWN: {
    message: ({name}: {name: string}) => `No page operation is named ${name}`,
  },
  NOT_A_PAGE_TOOL: {
    message: ({name}: {name: string}) => `"${name}" is not a page tool`,
  },
  OPERATION_FAILED: {
    message: 'The page operation failed',
  },
  QUEUE_STOPPED: {
    message: PAGE_QUEUE_STOPPED_MESSAGE,
    why: 'The user stopped the queue before this action ran.',
  },
  EFFECT_UNKNOWN: {
    message: 'No effect is registered under that name',
    fix: 'Call the effect tool with action list to see the registered effects.',
  },
  INVALID_ARGS: {
    status: 400,
    message: 'The page operation was given invalid arguments',
  },
  WAIT_TIMED_OUT: {
    message: ({selector, state}: {selector: string; state: string}) => `wait timed out for ${selector} (${state})`,
    fix: 'Check the selector against a fresh snapshot, or wait longer.',
  },
  RESULT_NOT_SERIALIZABLE: {
    message: ({action}: {action: string}) => `${action} returned a non-serializable result`,
  },
  RESULT_TOO_LARGE: {
    status: 413,
    message: 'Browser result exceeds 512000 JSON characters.',
    fix: 'Request fewer entries, reduce snapshot depth, or return only selected fields from the evaluation script. Repeating the same request will not reduce its output.',
  },
  RESULT_INVALID: {
    message: ({operation}: {operation: string}) => `Page returned an invalid result for page.${operation}.`,
    why: 'The engine and the page may run incompatible versions.',
    fix: 'Check that the engine and the page run compatible versions. Do not retry the same action to repair a protocol error; it may already have run. Report the mismatch if versions match.',
  },
  FILES_MALFORMED: {
    message: 'Page returned malformed file output.',
    fix: 'Check engine and page compatibility and report the invalid response; do not repeat the capture to repair a protocol error.',
  },
  FILES_TOO_LARGE: {
    status: 413,
    message: 'Capture files exceed the 5 MiB total transfer limit.',
    fix: 'Use a smaller screenshot or a smaller page; do not retry the identical capture.',
  },
  FILES_NOT_SAVED: {
    message: 'Cannot save page files on the server.',
    why: 'The page may have completed the capture, but no server-local file is confirmed.',
    fix: 'Check free space and write access on the server, then take the capture again.',
  },
  REACT_HOOK_UNAVAILABLE: {
    message: 'The react devtools hook is unavailable',
    why: 'Another devtools hook took the slot first, or the page runs no React.',
  },
  SESSION_NOT_ROUTED: {
    message: 'Page.symbolicate needs a routed session',
    fix: 'Open a chat session first, then try again.',
  },
  SOURCE_NOT_FOUND: {
    status: 404,
    message: 'No source location was found for the element',
  },
  DESKTOP_UNAVAILABLE: {
    message: 'No desktop is connected to open the source file',
    fix: 'Start the conciv engine on this machine so it can open files in your editor.',
  },
  SOURCE_OPEN_FAILED: {
    message: 'The source file could not be opened',
  },
  PATH_OUTSIDE_ROOT: {
    status: 403,
    message: ({path}: {path: string}) => `refused: ${path} outside project root`,
  },
  HOST_NOT_LOOPBACK: {
    status: 403,
    message: ({url}: {url: string}) => `refused: non-loopback host ${url}`,
  },
  PREVIEW_UNREADABLE: {
    message: 'The grab preview image could not be read',
  },
})

declare module 'evlog' {
  interface RegisteredErrorCatalogs {
    page: typeof pageErrors
  }
}
