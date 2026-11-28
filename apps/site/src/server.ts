import * as Sentry from '@sentry/cloudflare'
import {wrapFetchWithSentry} from '@sentry/tanstackstart-react'
import handler from '@tanstack/react-start/server-entry'
import {sentryOptions} from './lib/sentry-options'

const worker: ExportedHandler<Env> = Sentry.withSentry(() => sentryOptions(), wrapFetchWithSentry(handler))

export default worker
