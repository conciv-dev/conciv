import bannedVocabulary from './banned-vocabulary.js'
import corePurity from './core-purity.js'
import lucidePerIcon from './lucide-per-icon.js'
import noAwaitEffectQuery from './no-await-effect-query.js'
import noComments from './no-comments.js'
import noDelegatedFocus from './no-delegated-focus.js'
import noHandMadeTempDir from './no-hand-made-temp-dir.js'
import noLocatorPoll from './no-locator-poll.js'
import noOfSuffix from './no-of-suffix.js'
import noPredicateWaits from './no-predicate-waits.js'
import noSignalRef from './no-signal-ref.js'
import noTimersInTests from './no-timers-in-tests.js'
import pluginViewReadsThroughQuery from './plugin-view-reads-through-query.js'
import routerIdioms from './router-idioms.js'
import solidTestRender from './solid-test-render.js'
import testFileBudget from './test-file-budget.js'
import toolCardShell from './tool-card-shell.js'

export default {
  meta: {name: 'conciv'},
  rules: {
    'banned-vocabulary': bannedVocabulary,
    'core-purity': corePurity,
    'lucide-per-icon': lucidePerIcon,
    'no-await-effect-query': noAwaitEffectQuery,
    'no-comments': noComments,
    'no-delegated-focus': noDelegatedFocus,
    'no-hand-made-temp-dir': noHandMadeTempDir,
    'no-locator-poll': noLocatorPoll,
    'no-of-suffix': noOfSuffix,
    'no-predicate-waits': noPredicateWaits,
    'no-signal-ref': noSignalRef,
    'no-timers-in-tests': noTimersInTests,
    'plugin-view-reads-through-query': pluginViewReadsThroughQuery,
    'router-idioms': routerIdioms,
    'solid-test-render': solidTestRender,
    'test-file-budget': testFileBudget,
    'tool-card-shell': toolCardShell,
  },
}
