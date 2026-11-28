export const SENTRY_DSN =
  'https://3fdff4918ba95270506bf1f04c0300a6@o4512506916241408.ingest.us.sentry.io/4512506957201408'

export function sentryOptions() {
  return {
    dsn: SENTRY_DSN,
    environment: import.meta.env.PROD ? 'production' : 'development',
    tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0,
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
    },
  }
}
