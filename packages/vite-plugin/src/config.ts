// Re-export the generalized config from @devgent/core so existing
// `@devgent/vite-plugin/config` imports keep resolving.
export type {DevgentConfig, ResolvedDevgentConfig} from '@devgent/core/config'
export {resolveConfig, defineConfig} from '@devgent/core/config'
