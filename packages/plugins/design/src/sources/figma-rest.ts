import {Effect, Redacted} from 'effect'
import {HttpClient, type HttpClientResponse} from 'effect/http'
import {z} from 'zod'
import {designErrors} from '../errors/errors.js'
import type {FigmaLink} from './figma-link.js'

export type FigmaKey = Redacted.Redacted<string>

const FIGMA_API = 'https://api.figma.com/v1'
const UNAUTHORIZED = 401
const FORBIDDEN = 403
const URI_TOO_LONG = 414
const TOKEN_WORD = 'token'
const FigmaErrorSchema = z.object({err: z.string()})

export const figmaGet = Effect.fn('design.figmaGet')(function* (input: {path: string; key: FigmaKey; link: FigmaLink}) {
  const response = yield* figmaAnswer(input)
  if (response.status === URI_TOO_LONG) return yield* Effect.fail(yield* refused(response, input.link))
  return yield* figmaJson({response, link: input.link})
})

export const figmaAnswer = Effect.fn('design.figmaAnswer')(function* (input: {
  path: string
  key: FigmaKey
  link: FigmaLink
}) {
  const client = yield* HttpClient.HttpClient
  const response = yield* client
    .get(`${FIGMA_API}${input.path}`, {headers: {'X-Figma-Token': Redacted.value(input.key)}})
    .pipe(Effect.mapError(() => designErrors.FIGMA_REQUEST({detail: `Figma did not answer for ${input.link.nodeId}`})))
  if (response.status === URI_TOO_LONG) return response
  if (response.status < 200 || response.status >= 300) return yield* Effect.fail(yield* refused(response, input.link))
  return response
})

export const figmaJson = Effect.fn('design.figmaJson')(function* (input: {
  response: HttpClientResponse.HttpClientResponse
  link: FigmaLink
}) {
  return yield* input.response.json.pipe(
    Effect.mapError(() =>
      designErrors.FIGMA_REQUEST({detail: `Figma answered ${input.link.nodeId} with no JSON body`}),
    ),
  )
})

export const figmaDownload = Effect.fn('design.figmaDownload')(function* (input: {url: string; link: FigmaLink}) {
  const client = yield* HttpClient.HttpClient
  const response = yield* client
    .get(input.url)
    .pipe(
      Effect.mapError(() =>
        designErrors.FIGMA_REQUEST({detail: `Figma storage did not answer for ${input.link.nodeId}`}),
      ),
    )
  if (response.status < 200 || response.status >= 300)
    return yield* Effect.fail(
      designErrors.FIGMA_REQUEST({detail: `Figma storage answered ${response.status} for ${input.link.nodeId}`}),
    )
  const bytes = yield* response.arrayBuffer.pipe(
    Effect.mapError(() => designErrors.FIGMA_REQUEST({detail: `Figma storage sent no body for ${input.link.nodeId}`})),
  )
  return new Uint8Array(bytes)
})

const refused = Effect.fn('design.figmaRefused')(function* (
  response: HttpClientResponse.HttpClientResponse,
  link: FigmaLink,
) {
  const body = yield* response.json.pipe(Effect.orElseSucceed(() => null))
  const said = FigmaErrorSchema.safeParse(body).data?.err ?? `status ${response.status}`
  if (response.status === UNAUTHORIZED || said.toLowerCase().includes(TOKEN_WORD))
    return designErrors.FIGMA_TOKEN({detail: said})
  if (response.status === FORBIDDEN)
    return designErrors.FIGMA_REQUEST({detail: `Figma refused access to file ${link.fileKey}: ${said}`})
  return designErrors.FIGMA_REQUEST({detail: `Figma answered ${response.status} for ${link.nodeId}: ${said}`})
})
