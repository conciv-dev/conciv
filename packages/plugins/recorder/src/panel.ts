import {Effect, FiberSet, PubSub, Schedule, Stream, SubscriptionRef, type Scope, Schema} from 'effect'
import {z} from 'zod'
import type {Context} from '@conciv/plugin/experimental'
import {saveFileToDisk} from './download.js'
import {makeMachineDriver} from './machine-driver.js'
import {initialPanel, transitionPanel, type PanelEffect, type PanelState} from './panel-machine.js'
import {Recorder} from './rpc.js'

export const PresenceFailed = Schema.TaggedStruct('RecorderPresenceFailed', {cause: Schema.Defect()})
export type PresenceFailed = typeof PresenceFailed.Type

export const ExportFailed = Schema.TaggedStruct('RecorderExportFailed', {cause: Schema.Defect()})
export type ExportFailed = typeof ExportFailed.Type

export const ResetFailed = Schema.TaggedStruct('RecorderResetFailed', {cause: Schema.Defect()})
export type ResetFailed = typeof ResetFailed.Type

const VIEWER_RENEW = '7 seconds'

export type Panel = {
  readonly state: SubscriptionRef.SubscriptionRef<PanelState>
  readonly renewPresence: Effect.Effect<void>
  readonly requestExport: Effect.Effect<void>
  readonly requestReset: Effect.Effect<void>
  readonly live: SubscriptionRef.SubscriptionRef<boolean>
  readonly goLiveRequests: Stream.Stream<void>
  readonly requestGoLive: Effect.Effect<void>
}

export const openPanel = Effect.fn('recorder.panel')(function* (options: {
  readonly presence: (live: boolean) => Effect.Effect<void, PresenceFailed>
  readonly exportRecording: Effect.Effect<void, ExportFailed>
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
    work: Effect.Effect<void, ExportFailed | ResetFailed>,
    attempt: number,
    dispatch: (event: Parameters<typeof transitionPanel>[1]) => Effect.Effect<void>,
  ) =>
    work.pipe(
      Effect.matchEffect({
        onSuccess: () => dispatch({type: 'settled', attempt}),
        onFailure: (error) =>
          Effect.andThen(
            Effect.logError('recorder: a panel action failed', error),
            dispatch({type: 'failed', attempt}),
          ),
      }),
    )

  const driver = yield* makeMachineDriver({
    initial: initialPanel,
    transition: transitionPanel,
    run: (command: PanelEffect, current) => {
      if (command.type === 'export')
        return Effect.asVoid(
          FiberSet.run(running, settle(options.exportRecording, command.attempt, current.dispatch), {
            startImmediately: false,
          }),
        )
      if (command.type === 'reset')
        return Effect.asVoid(
          FiberSet.run(running, settle(options.reset, command.attempt, current.dispatch), {startImmediately: false}),
        )
      if (command.type === 'report-export-failed') return options.report('Could not export the recording. Try again.')
      return options.report('Could not start a new recording. Is the page still connected?')
    },
  })

  yield* Effect.addFinalizer(() => Effect.andThen(driver.dispatch({type: 'disposed'}), presence(false)))
  yield* presence(true).pipe(Effect.repeat(Schedule.spaced(VIEWER_RENEW)), Effect.forkScoped)

  return {
    state: driver.state,
    renewPresence: presence(true),
    requestExport: driver.dispatch({type: 'export.requested'}),
    requestReset: driver.dispatch({type: 'reset.requested'}),
    live: following,
    goLiveRequests: Stream.fromPubSub(goLive),
    requestGoLive: Effect.asVoid(PubSub.publish(goLive, undefined)),
  }
})

const SavedRecording = z.object({recordingId: z.string()})

export type VideoPiece = {readonly data: string; readonly eof: boolean; readonly name: string; readonly mime: string}

function base64Bytes(data: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(data), (character) => character.charCodeAt(0))
}

export function exportRecording(options: {
  readonly save: Effect.Effect<unknown, ExportFailed>
  readonly readPiece: (id: string, offset: number) => Effect.Effect<VideoPiece, ExportFailed>
  readonly saveFile: (file: File) => Effect.Effect<void>
}): Effect.Effect<void, ExportFailed> {
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
    Effect.flatMap((saved) => {
      const parsed = SavedRecording.safeParse(saved)
      if (!parsed.success) return Effect.fail(ExportFailed.make({cause: saved}))
      return readVideo(parsed.data.recordingId, 0, [])
    }),
    Effect.flatMap(options.saveFile),
  )
}

export function recorderPanelCalls(options: {
  readonly client: () => Context['client']
  readonly clientId: string
  readonly viewerId: string
  readonly refresh: () => Promise<void>
}) {
  const recorder = () => options.client().rpc(Recorder)
  return {
    presence: (live: boolean) =>
      Effect.asVoid(
        Effect.tryPromise({
          try: () => recorder().presence({viewerId: options.viewerId, live}),
          catch: (cause) => PresenceFailed.make({cause}),
        }),
      ),
    exportRecording: exportRecording({
      save: Effect.tryPromise({
        try: () => recorder()['recordings.save']({clientId: options.clientId}),
        catch: (cause) => ExportFailed.make({cause}),
      }),
      readPiece: (id, offset) =>
        Effect.tryPromise({
          try: () => recorder()['recordings.exportVideo']({clientId: options.clientId, id, offset}),
          catch: (cause) => ExportFailed.make({cause}),
        }),
      saveFile: (file) => Effect.sync(() => saveFileToDisk(file)),
    }),
    reset: Effect.tryPromise({
      try: async () => {
        await recorder().reset(undefined)
        await options.refresh()
      },
      catch: (cause) => ResetFailed.make({cause}),
    }),
  }
}
