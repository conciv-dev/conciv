import bannedVocabulary from './banned-vocabulary.js'
import corePurity from './core-purity.js'
import lucidePerIcon from './lucide-per-icon.js'
import noComments from './no-comments.js'
import noLocatorPoll from './no-locator-poll.js'
import noPredicateWaits from './no-predicate-waits.js'
import noSignalRef from './no-signal-ref.js'
import noTimersInTests from './no-timers-in-tests.js'
import routerIdioms from './router-idioms.js'
import solidTestRender from './solid-test-render.js'
import toolCardShell from './tool-card-shell.js'

export default {
  meta: {name: 'conciv'},
  rules: {
    'banned-vocabulary': bannedVocabulary,
    'core-purity': corePurity,
    'lucide-per-icon': lucidePerIcon,
    'no-comments': noComments,
    'no-locator-poll': noLocatorPoll,
    'no-predicate-waits': noPredicateWaits,
    'no-signal-ref': noSignalRef,
    'no-timers-in-tests': noTimersInTests,
    'router-idioms': routerIdioms,
    'solid-test-render': solidTestRender,
    'tool-card-shell': toolCardShell,
  },
}
