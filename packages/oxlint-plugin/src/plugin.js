import noComments from './no-comments.js'
import noLocatorPoll from './no-locator-poll.js'
import noPredicateWaits from './no-predicate-waits.js'
import noTimersInTests from './no-timers-in-tests.js'
import routerIdioms from './router-idioms.js'

export default {
  meta: {name: 'conciv'},
  rules: {
    'no-comments': noComments,
    'no-locator-poll': noLocatorPoll,
    'no-predicate-waits': noPredicateWaits,
    'no-timers-in-tests': noTimersInTests,
    'router-idioms': routerIdioms,
  },
}
