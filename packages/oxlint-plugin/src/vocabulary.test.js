import {describe, it} from 'vitest'
import {RuleTester} from 'oxlint/plugins-dev'
import {bannedVocabulary, corePurity, noOfSuffix} from './vocabulary.js'

RuleTester.describe = describe
RuleTester.it = it

const tester = new RuleTester()
const appFile = '/repo/packages/app/src/view.ts'

tester.run('banned-vocabulary', bannedVocabulary, {
  valid: [
    {name: 'a word that only contains the term', code: 'const bridgework = 1', filename: appFile},
    {name: 'a plural before the last segment', code: 'const forcesSend = 1', filename: appFile},
    {name: 'a use that declares nothing', code: 'call(bridge)', filename: appFile},
    {name: 'a computed key', code: 'const value = {[bridge]: 1}', filename: appFile},
    {name: 'a term allowed at its path', code: 'const bridge = 1', filename: '/repo/packages/core/src/app.ts'},
    {name: 'an exempt file', code: 'const bridge = 1', filename: '/repo/packages/oxlint-plugin/src/rule.js'},
    {
      name: 'an exempt file, Windows',
      code: 'const bridge = 1',
      filename: 'C:\\repo\\packages\\oxlint-plugin\\src\\rule.js',
    },
  ],
  invalid: [
    {
      name: 'a camel-case segment',
      code: 'const sessionBridge = 1',
      filename: appFile,
      errors: [{messageId: 'banned', data: {name: 'sessionBridge', term: 'bridge'}}],
    },
    {
      name: 'a plural last segment',
      code: 'const managers = []',
      filename: appFile,
      errors: [{messageId: 'banned', data: {name: 'managers', term: 'manager'}}],
    },
    {
      name: 'a term of several segments',
      code: 'function holdAndFlushQueue() {}',
      filename: appFile,
      errors: [{messageId: 'banned', data: {name: 'holdAndFlushQueue', term: 'holdAndFlush'}}],
    },
    {
      name: 'a snake-case name',
      code: 'const EPOCH_START = 1',
      filename: appFile,
      errors: [{messageId: 'banned', data: {name: 'EPOCH_START', term: 'epoch'}}],
    },
    {
      name: 'a destructured name',
      code: 'const {value: presenceState} = store',
      filename: appFile,
      errors: [{messageId: 'banned', data: {name: 'presenceState', term: 'presence'}}],
    },
    {
      name: 'an object key',
      code: 'const value = {vetoReason: 1}',
      filename: appFile,
      errors: [{messageId: 'banned', data: {name: 'vetoReason', term: 'veto'}}],
    },
    {
      name: 'a name reported once',
      code: 'const bridge = 1; function send(bridge) {}',
      filename: appFile,
      errors: [{messageId: 'banned', data: {name: 'bridge', term: 'bridge'}}],
    },
    {
      name: 'another term at an allowed path',
      code: 'const epoch = 1',
      filename: '/repo/packages/core/src/app.ts',
      errors: [{messageId: 'banned', data: {name: 'epoch', term: 'epoch'}}],
    },
  ],
})

tester.run('core-purity', corePurity, {
  valid: [{name: 'a core word', code: 'const sessionId = 1', filename: '/repo/packages/core/src/app.ts'}],
  invalid: [
    {
      name: 'a terminal name',
      code: 'const terminalId = 1',
      filename: '/repo/packages/core/src/app.ts',
      errors: [{messageId: 'banned', data: {name: 'terminalId', term: 'terminal'}}],
    },
  ],
})

tester.run('no-of-suffix', noOfSuffix, {
  valid: [
    {name: 'a language name', code: 'const value = {valueOf() {}}', filename: appFile},
    {name: 'Of alone', code: 'const Of = 1', filename: appFile},
    {name: 'a ported file', code: 'function approvalAskOf() {}', filename: '/repo/packages/plugin-host/src/ask.ts'},
  ],
  invalid: [
    {
      name: 'a name ending in Of',
      code: 'function approvalAskOf() {}',
      filename: appFile,
      errors: [{messageId: 'banned', data: {name: 'approvalAskOf'}}],
    },
  ],
})
