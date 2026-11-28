import type {Register} from '@tanstack/react-router'
import * as Sentry from '@sentry/cloudflare'
import {env} from 'cloudflare:workers'
import {wrapFetchWithSentry} from '@sentry/tanstackstart-react'
import handler from '@tanstack/react-start/server-entry'
import type {RequestOptions} from '@tanstack/react-start/server'
import {sentryOptions} from './lib/sentry-options'
import {readStarCount} from './lib/star-count.server'
import {withStarCount} from './lib/star-count-rewriter'

async function routeRequest(request: Request, opts?: RequestOptions<Register>): Promise<Response> {
  if (request.method !== 'GET') return handler.fetch(request, opts)
  const asset = await env.ASSETS.fetch(request)
  return asset.status === 404 ? handler.fetch(request, opts) : asset
}

async function fetchPage(request: Request, opts?: RequestOptions<Register>): Promise<Response> {
  const response = await routeRequest(request, opts)
  if (!response.headers.get('content-type')?.startsWith('text/html')) return response
  return withStarCount(response, await readStarCount())
}

const worker: ExportedHandler<Env> = Sentry.withSentry(() => sentryOptions(), wrapFetchWithSentry({fetch: fetchPage}))

export default worker
