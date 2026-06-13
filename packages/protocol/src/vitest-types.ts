// DEPRECATED — kept for one migration cycle. Import from '@devgent/protocol/test-types'.
// Re-exports the generalized test types, plus the two renamed types under their former
// names so existing consumers (the widget's vitest-card) stay green until they migrate.
export * from './test-types.js'
export type {TestEvent as VitestEvent, TestRunResult as RunResult} from './test-types.js'
