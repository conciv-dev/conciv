import {defineErrorCatalog} from 'evlog'

export const clientErrors = defineErrorCatalog('client', {
  ENGINE_UNREACHABLE: {
    status: 503,
    message: 'the engine cannot be reached',
    why: 'the connection to the engine is closed or not open yet',
    fix: 'check that the dev server is running; the widget reconnects on its own',
  },
  NOT_AN_RPC_FRAME: {
    status: 502,
    message: 'the frame is not an rpc server message',
    why: 'the engine socket delivered a frame the rpc peer cannot read',
    fix: 'reload the page so the widget and the engine speak the same version',
  },
  SETTINGS_CLOSED: {
    status: 503,
    message: ({scope, namespace}: {scope: string; namespace: string}) =>
      `conciv: the ${scope} settings of "${namespace}" closed`,
    why: 'the engine ended the settings stream before it sent the first snapshot',
    fix: 'reload the page to read the settings again',
  },
  MESSAGE_WITHDRAWN: {
    status: 409,
    message: 'The message was taken back before the engine had it',
    why: 'the run was withdrawn before the engine received the message',
    fix: 'send the message again',
  },
  UNKNOWN_RPC_EVENT: {
    status: 400,
    message: ({id, name}: {id: string; name: string}) => `Unknown RPC event: ${id}.${name}`,
    why: "the plugin's rpc definition declares no event with that name",
    fix: "subscribe to an event the plugin's rpc definition declares",
  },
  SUBSCRIBER_OVERFLOW: {
    status: 503,
    message: ({capacity}: {capacity: number}) => `Event subscriber exceeded its ${capacity}-event capacity`,
    why: 'the subscriber did not read its events as fast as they arrived',
    fix: 'read the events faster, or subscribe with a larger capacity',
  },
  FAILED: {
    status: 500,
    message: 'the call failed',
    why: 'something failed with a value that is not an Error',
    fix: "read the widget's logs for the failure",
  },
})
