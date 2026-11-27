import {Effect} from 'effect'
import {HttpClient, type HttpClientResponse} from 'effect/http'
import {z} from 'zod'
import {designErrors} from '../errors/errors.js'
import type {FigmaLink} from './figma-link.js'

const FIGMA_API = 'https://api.figma.com/v1'
const UNAUTHORIZED = 401
const FORBIDDEN = 403
const TOKEN_WORD = 'token'
const FigmaErrorSchema = z.object({err: z.string()})

export const figmaGet = Effect.fn('design.figmaGet')(function* (input: {path: string; token: string; link: FigmaLink}) {
  const client = yield* HttpClient.HttpClient
  const response = yield* client
    .get(`${FIGMA_API}${input.path}`, {headers: {'X-Figma-Token': input.token}})
    .pipe(
      Effect.mapError((error) =>
        designErrors.FIGMA_REQUEST({detail: `Figma did not answer for ${input.link.nodeId}: ${error.message}`}),
      ),
    )
  if (response.status < 200 || response.status >= 300) return yield* Effect.fail(yield* refused(response, input.link))
  return yield* response.json.pipe(
    Effect.mapError(() =>
      designErrors.FIGMA_REQUEST({detail: `Figma answered ${input.link.nodeId} with no JSON body`}),
    ),
  )
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
