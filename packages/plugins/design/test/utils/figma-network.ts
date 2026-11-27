import {Effect, FileSystem, Layer, Path} from 'effect'
import {HttpClient, HttpClientResponse} from 'effect/http'

export type FigmaAnswer = {readonly path: string; readonly status: number; readonly fixture: string}

export const figmaNetwork = (answers: readonly FigmaAnswer[]) =>
  Layer.effect(
    HttpClient.HttpClient,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const fixtures = path.join(import.meta.dirname, '..', 'fixtures')
      const bodies = yield* Effect.forEach(answers, (answer) =>
        fs.readFileString(path.join(fixtures, answer.fixture)).pipe(Effect.map((body) => ({...answer, body}))),
      )
      return HttpClient.make((request, url) =>
        Effect.sync(() => {
          const answer = bodies.find((candidate) => `${url.pathname}${url.search}` === `/v1${candidate.path}`)
          const response =
            answer === undefined
              ? new Response(JSON.stringify({status: 404, err: 'Not found'}), {status: 404})
              : new Response(answer.body, {status: answer.status, headers: {'content-type': 'application/json'}})
          return HttpClientResponse.fromWeb(request, response)
        }),
      )
    }),
  ).pipe(Layer.orDie)
