import {Effect, FiberSet, PubSub, Schedule, Stream, SubscriptionRef, type Scope} from 'effect'
import type {EvlogError} from 'evlog'
import {z} from 'zod'
import type {Context} from '@conciv/frontend-plugin-api'
import {makeMachineDriver} from './machine-driver.js'
import {RecorderPanelMachine} from './panel-machine.js'
import {Recorder} from './rpc.js'
import {causeOverrides, recorderErrors} from './errors/errors.js'

const SaveRefusal = z.object({reason: z.enum(['empty', 'too-large', 'io-error'])})

const VIEWER_RENEW = '7 seconds'

const SAVE_REFUSALS: Record<RecorderPanelMachine.SaveFailure, string> = {
  empty: 'Nothing to save yet: interact with the page first.',
  'too-large': 'The recording is too large to save. Start a new recording.',
  'io-error': 'Could not write the recording to the project folder. Try again.',
}

type PanelWork = Effect.Effect<void, EvlogError>

export type Panel = {
  readonly state: SubscriptionRef.SubscriptionRef<RecorderPanelMachine.PanelState>
  readonly requestExport: Effect.Effect<void>
  readonly requestSend: Effect.Effect<void>
  readonly requestReset: Effect.Effect<void>
  readonly live: SubscriptionRef.SubscriptionRef<boolean>
  readonly goLiveRequests: Stream.Stream<void>
  readonly requestGoLive: Effect.Effect<void>
}

export const openPanel = Effect.fn('recorder.panel')(function* (options: {
  readonly presence: (live: boolean) => Effect.Effect<void, EvlogError>
  readonly exportRecording: Effect.Effect<void, EvlogError>
  readonly sendToAgent: Effect.Effect<void, EvlogError>
  readonly reset: Effect.Effect<void, EvlogError>
  readonly report: (title: string) => Effect.Effect<void>
}): Effect.fn.Return<Panel, never, Scope.Scope> {
  const running = yield* FiberSet.make()
  const following = yield* SubscriptionRef.make(true)
  const goLive = yield* PubSub.unbounded<void>()
  const presence = (live: boolean) =>
    options
      .presence(live)
      .pipe(Effect.catch((error) => Effect.logWarning('recorder: the viewer lease could not be renewed', error)))

  const settle = (
    work: PanelWork,
    attempt: number,
    dispatch: (event: Parameters<typeof RecorderPanelMachine.transitionPanel>[1]) => Effect.Effect<void>,
  ) =>
    work.pipe(
      Effect.andThen(dispatch({type: 'settled', attempt})),
      Effect.catchIf(
        (error) => error.code === recorderErrors.SAVE_REFUSED.code,
        (refused) => dispatch({type: 'failed', attempt, refused: SaveRefusal.safeParse(refused.internal).data?.reason}),
      ),
      Effect.catch((error) =>
        Effect.andThen(Effect.logError('recorder: a panel action failed', error), dispatch({type: 'failed', attempt})),
      ),
    )

  const work = {export: options.exportRecording, send: options.sendToAgent, reset: options.reset}

  const driver = yield* makeMachineDriver({
    initial: RecorderPanelMachine.initialPanel,
    transition: RecorderPanelMachine.transitionPanel,
    run: (command: RecorderPanelMachine.PanelEffect, current) => {
      if (command.type === 'export' || command.type === 'send' || command.type === 'reset')
        return Effect.asVoid(
          FiberSet.run(running, settle(work[command.type], command.attempt, current.dispatch), {
            startImmediately: false,
          }),
        )
      if (command.type === 'report-save-refused') return options.report(SAVE_REFUSALS[command.reason])
      if (command.type === 'report-export-failed') return options.report('Could not export the recording. Try again.')
      if (command.type === 'report-send-failed') return options.report('Could not save the recording. Try again.')
      return options.report('Could not start a new recording. Is the page still connected?')
    },
  })

  yield* Effect.addFinalizer(() => Effect.andThen(driver.dispatch({type: 'disposed'}), presence(false)))
  yield* presence(true).pipe(Effect.repeat(Schedule.spaced(VIEWER_RENEW)), Effect.forkScoped)

  return {
    state: driver.state,
    requestExport: driver.dispatch({type: 'export.requested'}),
    requestSend: driver.dispatch({type: 'send.requested'}),
    requestReset: driver.dispatch({type: 'reset.requested'}),
    live: following,
    goLiveRequests: Stream.fromPubSub(goLive),
    requestGoLive: Effect.asVoid(PubSub.publish(goLive, undefined)),
  }
})

export type VideoPiece = {readonly data: string; readonly eof: boolean; readonly name: string; readonly mime: string}

type SavedRecording = {readonly recordingId: string; readonly summary: string}

type SaveOutput =
  | {readonly saved: true; readonly recordingId: string; readonly summary: string}
  | {
      readonly saved: false
      readonly error: RecorderPanelMachine.SaveFailure
    }

function saveRecording(options: {
  readonly flush: Effect.Effect<void>
  readonly save: Effect.Effect<SaveOutput, EvlogError>
}): Effect.Effect<SavedRecording, EvlogError> {
  return Effect.andThen(options.flush, options.save).pipe(
    Effect.flatMap((stored) =>
      stored.saved
        ? Effect.succeed(stored)
        : Effect.fail(recorderErrors.SAVE_REFUSED({internal: {reason: stored.error}})),
    ),
  )
}

function base64Bytes(data: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(data), (character) => character.charCodeAt(0))
}

export function exportRecording<Failure>(options: {
  readonly save: Effect.Effect<{readonly recordingId: string}, Failure>
  readonly readPiece: (id: string, offset: number) => Effect.Effect<VideoPiece, EvlogError>
  readonly saveFile: (file: File) => Effect.Effect<void>
}): Effect.Effect<void, Failure | EvlogError> {
  const readVideo = (
    id: string,
    offset: number,
    parts: readonly Uint8Array<ArrayBuffer>[],
  ): Effect.Effect<File, EvlogError> =>
    Effect.flatMap(options.readPiece(id, offset), (piece) => {
      const bytes = base64Bytes(piece.data)
      if (piece.eof) return Effect.succeed(new File([...parts, bytes], piece.name, {type: piece.mime}))
      return readVideo(id, offset + bytes.length, [...parts, bytes])
    })
  return options.save.pipe(
    Effect.flatMap((saved) => readVideo(saved.recordingId, 0, [])),
    Effect.flatMap(options.saveFile),
  )
}

export function recorderPanelCalls(options: {
  readonly client: () => Context['client']
  readonly save: (input: {clientId: string}) => Promise<SaveOutput>
  readonly reset: () => Promise<unknown>
  readonly clientId: string
  readonly viewerId: string
  readonly refresh: () => Promise<void>
  readonly flush: Effect.Effect<void>
  readonly readPiece: (id: string, offset: number) => Effect.Effect<VideoPiece, EvlogError>
  readonly saveFile: (file: File) => Effect.Effect<void>
  readonly noteSaved: (saved: SavedRecording) => void
}) {
  const recorder = () => options.client().rpc(Recorder)
  const save = (failure: (cause: unknown) => EvlogError) =>
    saveRecording({
      flush: options.flush,
      save: Effect.tryPromise({
        try: () => options.save({clientId: options.clientId}),
        catch: failure,
      }),
    })
  return {
    presence: (live: boolean) =>
      Effect.asVoid(
        Effect.tryPromise({
          try: () => recorder().presence({viewerId: options.viewerId, live}),
          catch: (cause) => recorderErrors.PRESENCE_FAILED(causeOverrides(cause)),
        }),
      ),
    exportRecording: exportRecording({
      save: save((cause) => recorderErrors.EXPORT_FAILED(causeOverrides(cause))),
      readPiece: options.readPiece,
      saveFile: options.saveFile,
    }),
    sendToAgent: save((cause) => recorderErrors.SEND_FAILED(causeOverrides(cause))).pipe(
      Effect.flatMap((saved) =>
        Effect.try({
          try: () => options.noteSaved(saved),
          catch: (cause) => recorderErrors.SEND_FAILED(causeOverrides(cause)),
        }),
      ),
    ),
    reset: Effect.tryPromise({
      try: async () => {
        await options.reset()
        await options.refresh()
      },
      catch: (cause) => recorderErrors.RESET_FAILED(causeOverrides(cause)),
    }),
  }
}
