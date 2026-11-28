import * as NodeServices from '@effect/platform-node/NodeServices'
import {Effect, FileSystem, Layer, Path} from 'effect'
import {HttpClient, HttpClientResponse} from 'effect/http'

export type FigmaAnswer = {readonly url: string; readonly fixture: string; readonly status?: number}

const FIGMA_API = 'https://api.figma.com/v1'
const REFUSED = JSON.stringify({status: 403, err: 'Invalid token'})
const MISSING = JSON.stringify({status: 404, err: 'Not found'})

export const figmaNetwork = (input: {readonly key: string; readonly answers: readonly FigmaAnswer[]}) =>
  Layer.effect(
    HttpClient.HttpClient,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const fixtures = path.join(import.meta.dirname, '..', 'fixtures')
      const bodies = yield* Effect.forEach(input.answers, (answer) =>
        fs.readFile(path.join(fixtures, answer.fixture)).pipe(
          Effect.map((body) => ({
            ...answer,
            url: answer.url.startsWith('/') ? `${FIGMA_API}${answer.url}` : answer.url,
            body,
            type: answer.fixture.endsWith('.png') ? 'image/png' : 'application/json',
          })),
        ),
      )
      return HttpClient.make((request, url) =>
        Effect.sync(() => {
          const api = url.href.startsWith(FIGMA_API)
          if (api && request.headers['x-figma-token'] !== input.key)
            return HttpClientResponse.fromWeb(request, new Response(REFUSED, {status: 403}))
          const answer = bodies.find((candidate) => candidate.url === url.href)
          const response =
            answer === undefined
              ? new Response(MISSING, {status: 404})
              : new Response(new Uint8Array(answer.body), {
                  status: answer.status ?? 200,
                  headers: {'content-type': answer.type},
                })
          return HttpClientResponse.fromWeb(request, response)
        }),
      )
    }),
  ).pipe(Layer.provide(NodeServices.layer), Layer.orDie)

const STORAGE = 'https://figma-alpha-api.s3.us-west-2.amazonaws.com/images/'
const FILLS = [
  '3205392a01dcf643e731fe2d5bed129994290d15',
  '3cf97699bf6b954360c49ad34e129d1ebd1f7693',
  'f4fdd2a23aecc907f995d84427b3721050e3a086',
]

export const figmaFrame = (input: {name: string; fileKey: string; node: string}): FigmaAnswer[] => {
  const ids = encodeURIComponent(input.node)
  return [
    {url: `/files/${input.fileKey}/nodes?ids=${ids}`, fixture: `figma-${input.name}-nodes.json`},
    {url: `/images/${input.fileKey}?ids=${ids}&format=png&scale=1`, fixture: `figma-${input.name}-render.json`},
    {url: `${STORAGE}render-${input.name}`, fixture: `figma-${input.name}-render.png`},
  ]
}

export const figmaFills = (input: {fileKey: string; fixture: string}): FigmaAnswer[] => [
  {url: `/files/${input.fileKey}/images`, fixture: 'figma-image-fills.json'},
  ...FILLS.map((ref) => ({url: `${STORAGE}fill-${ref}`, fixture: input.fixture})),
]
