import {defineErrorCatalog} from 'evlog'

export const recorderErrors = defineErrorCatalog('recorder', {
  CONFIG_INVALID: {
    status: 400,
    message: ({detail}: {detail: string}) => `Invalid recorder plugin options: ${detail}`,
    fix: 'Fix the recorder options in the conciv config.',
  },
  CONFIG_READ_FAILED: {
    message: 'The recorder settings could not be read from the engine',
    why: 'The engine connection dropped or the engine did not answer.',
    fix: 'Check that the engine is running, then reload the page.',
  },
  STATE_READ_FAILED: {
    message: 'The recorder state could not be read from the engine',
    why: 'The engine connection dropped or the engine did not answer.',
    fix: 'Check that the engine is running, then reload the page.',
  },
  CAPTURE_LIBRARY_LOAD_FAILED: {
    message: 'The page capture library could not load',
    why: 'The rrweb bundle failed to download or run in this page.',
    fix: 'Reload the page and try again.',
  },
  FLUSH_FAILED: {message: 'Recorded events could not be sent to the engine'},
  FOLLOW_FAILED: {message: 'The replay could not follow new events'},
  RENDERER_UNAVAILABLE: {
    message: 'The keyframe renderer could not launch',
    why: 'Chromium for Playwright is missing or failed to start.',
    fix: 'Install it with `npx playwright install chromium`.',
  },
  RENDER_FAILED: {message: 'Rendering the recording failed'},
  RECORDING_NOT_FOUND: {
    status: 404,
    message: ({id}: {id: string}) => `There is no saved recording ${id}`,
    fix: 'Use the id from a screen recording note the user sent.',
  },
  RECORDING_EXPIRED: {
    status: 410,
    message: ({id}: {id: string}) => `The recording ${id} has expired`,
    why: 'Saved recordings are kept for seven days.',
    fix: 'Ask the user to record it again.',
  },
  VIDEO_UNRENDERED: {
    message: ({id}: {id: string}) => `The recording ${id} could not be rendered to video`,
    why: 'The replay browser failed or recorded no video.',
  },
  VIDEO_UNREADABLE: {message: ({id}: {id: string}) => `The video of the recording ${id} could not be read`},
  CAPTURE_NOT_FOUND: {
    status: 404,
    message: ({captureId}: {captureId: string}) => `No active capture ${captureId}`,
    fix: 'Start a recording with recording_start and stop it with the captureId it returned.',
  },
  NO_PAGE_CLIENT: {
    message: 'No page client attached within 5s; the app page with the widget must be open to record',
    fix: 'Open the app page with the widget, then start the recording again.',
  },
  PRESENCE_FAILED: {message: 'The viewer lease could not be renewed'},
  EXPORT_FAILED: {message: 'The recording could not be exported'},
  SEND_FAILED: {message: 'The recording could not be saved for the agent'},
  SAVE_REFUSED: {message: 'The recording was not saved'},
  RESET_FAILED: {message: 'A new recording could not be started'},
})

export function causeFrom(
  thrown: unknown,
  internal?: Record<string, unknown>,
): {cause: Error; internal?: Record<string, unknown>} | {internal: Record<string, unknown>} {
  return thrown instanceof Error ? {cause: thrown, internal} : {internal: {...internal, thrown}}
}

declare module 'evlog' {
  interface RegisteredErrorCatalogs {
    recorder: typeof recorderErrors
  }
}
