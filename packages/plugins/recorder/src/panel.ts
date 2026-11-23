import {Effect, FiberSet, PubSub, Schedule, Stream, SubscriptionRef, type Scope, Schema} from 'effect'
import type {Context} from '@conciv/plugin/experimental'
import {makeMachineDriver} from './machine-driver.js'
import {RecorderPanelMachine} from './panel-machine.js'
import {Recorder} from './rpc.js'

const PresenceFailed = Schema.TaggedStruct('RecorderPresenceFailed', {cause: Schema.Defect()})
type PresenceFailed = typeof PresenceFailed.Type

export const ExportFailed = Schema.TaggedStruct('RecorderExportFailed', {cause: Schema.Defect()})
export type ExportFailed = typeof ExportFailed.Type

const SendFailed = Schema.TaggedStruct('RecorderSendFailed', {cause: Schema.Defect()})
type SendFailed = typeof SendFailed.Type

const SaveRefused = Schema.TaggedStruct('RecorderSaveRefused', {
  reason: Schema.Literals(['empty', 'too-large', 'io-error']),
})
type SaveRefused = typeof SaveRefused.Type

const ResetFailed = Schema.TaggedStruct('RecorderResetFailed', {cause: Schema.Defect()})
type ResetFailed = typeof ResetFailed.Type

const VIEWER_RENEW = '7 seconds'

const SAVE_REFUSALS: Record<RecorderPanelMachine.SaveFailure, string> = {
  empty: 'Nothing to save yet: interact with the page first.',
  'too-large': 'The recording is too large to save. Start a new recording.',
  'io-error': 'Could not write the recording to the project folder. Try again.',
}

type PanelWork = Effect.Effect<void, ExportFailed | SendFailed | SaveRefused | ResetFailed>

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
  readonly presence: (live: boolean) => Effect.Effect<void, PresenceFailed>
  readonly exportRecording: Effect.Effect<void, ExportFailed | SaveRefused>
  readonly sendToAgent: Effect.Effect<void, SendFailed | SaveRefused>
  readonly reset: Effect.Effect<void, ResetFailed>
  readonly report: (title: string) => Effect.Effect<void>
}): Effect.fn.Return<Panel, never, Scope.Scope> {
  const running = yield* FiberSet.make()
  const following = yield* SubscriptionRef.make(true)
  const goLive = yield* PubSub.unbounded<void>()
  const presence = (live: boolean) =>
    options
      .presence(live)
      .pipe(
        Effect.catchTag('RecorderPresenceFailed', (error) =>
          Effect.logWarning('recorder: the viewer lease could not be renewed', error.cause),
        ),
      )

  const settle = (
    work: PanelWork,
    attempt: number,
    dispatch: (event: Parameters<typeof RecorderPanelMachine.transitionPanel>[1]) => Effect.Effect<void>,
  ) =>
    work.pipe(
      Effect.andThen(dispatch({type: 'settled', attempt})),
      Effect.catchTag('RecorderSaveRefused', (refused) => dispatch({type: 'failed', attempt, refused: refused.reason})),
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

function saveRecording<Failure>(options: {
  readonly flush: Effect.Effect<void>
  readonly save: Effect.Effect<SaveOutput, Failure>
}): Effect.Effect<SavedRecording, Failure | SaveRefused> {
  return Effect.andThen(options.flush, options.save).pipe(
    Effect.flatMap((stored) =>
      stored.saved ? Effect.succeed(stored) : Effect.fail(SaveRefused.make({reason: stored.error})),
    ),
  )
}

function base64Bytes(data: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(data), (character) => character.charCodeAt(0))
}

export function exportRecording<Failure>(options: {
  readonly save: Effect.Effect<{readonly recordingId: string}, Failure>
  readonly readPiece: (id: string, offset: number) => Effect.Effect<VideoPiece, ExportFailed>
  readonly saveFile: (file: File) => Effect.Effect<void>
}): Effect.Effect<void, Failure | ExportFailed> {
  const readVideo = (
    id: string,
    offset: number,
    parts: readonly Uint8Array<ArrayBuffer>[],
  ): Effect.Effect<File, ExportFailed> =>
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
  readonly readPiece: (id: string, offset: number) => Effect.Effect<VideoPiece, ExportFailed>
  readonly saveFile: (file: File) => Effect.Effect<void>
  readonly noteSaved: (saved: SavedRecording) => void
}) {
  const recorder = () => options.client().rpc(Recorder)
  const save = <Failure>(failure: (cause: unknown) => Failure) =>
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
          catch: (cause) => PresenceFailed.make({cause}),
        }),
      ),
    exportRecording: exportRecording({
      save: save((cause) => ExportFailed.make({cause})),
      readPiece: options.readPiece,
      saveFile: options.saveFile,
    }),
    sendToAgent: save((cause) => SendFailed.make({cause})).pipe(
      Effect.flatMap((saved) =>
        Effect.try({
          try: () => options.noteSaved(saved),
          catch: (cause) => SendFailed.make({cause}),
        }),
      ),
    ),
    reset: Effect.tryPromise({
      try: async () => {
        await options.reset()
        await options.refresh()
      },
      catch: (cause) => ResetFailed.make({cause}),
    }),
  }
}
