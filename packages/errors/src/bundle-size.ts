import {defineErrorCatalog} from 'evlog'

export const bundleSizeErrors = defineErrorCatalog('bundle-size', {
  WORKER_SIZE_LINE_COUNT: {
    message: ({found}: {found: number}) =>
      `expected exactly one wrangler size line, found ${found}. Could not read the worker size from wrangler output`,
  },
  WORKER_SIZE_UNREADABLE: {message: 'could not read the worker size from wrangler output'},
  WORKER_NOT_BUILT: {
    message: ({config}: {config: string}) => `${config} is missing, so the worker size cannot be measured`,
    fix: 'Build it first: pnpm exec turbo run build --filter=site',
  },
})

declare module 'evlog' {
  interface RegisteredErrorCatalogs {
    'bundle-size': typeof bundleSizeErrors
  }
}
