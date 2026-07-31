import {describe, expect, it} from 'vitest'
import type {IosConfig} from '../src/shared/meta.js'
import {iosSystemPrompt} from '../src/server/prompt.js'

const config: IosConfig = {
  projectRoot: 'apps/PayApp',
  bundleId: 'dev.conciv.pay',
  simulator: 'iPhone 17 Pro',
  buildMode: 'xcodebuild',
}

function prompt(overrides: Partial<IosConfig> = {}, cwd = '/Users/dev/pay'): string {
  return iosSystemPrompt({...config, ...overrides}, {cwd})
}

describe('ios system prompt', () => {
  it('keeps steering the agent to ios.build instead of a demo build script', () => {
    expect(prompt()).not.toContain('build.sh')
    expect(prompt()).toContain('ios.build')
  })

  it('names the session it is serving: the app, the simulator, and the working directory', () => {
    const text = prompt()
    expect(text).toContain('/Users/dev/pay/apps/PayApp')
    expect(text).toContain('dev.conciv.pay')
    expect(text).toContain('iPhone 17 Pro')
    expect(text).toContain('Your working directory is /Users/dev/pay')
  })

  it('rules out filesystem-wide crawls and points searches at the project', () => {
    const text = prompt()
    expect(text).toContain('Never search from the filesystem root')
    expect(text).toContain('find /')
    expect(text).toContain('grep -rn "class PaymentCardCell" /Users/dev/pay/apps/PayApp')
  })

  it('uses an absolute project root as configured', () => {
    expect(prompt({projectRoot: '/opt/PayApp'})).toContain('the iOS project at /opt/PayApp,')
  })

  it('names the scheme when one is configured and says so when none is', () => {
    expect(prompt({scheme: 'PayApp'})).toContain('scheme PayApp')
    expect(prompt()).toContain('the default scheme')
  })

  it('lists extra swift source roots when the app keeps sources outside the project root', () => {
    expect(prompt({extraSourceDirs: ['../ConcivWidget/Sources']})).toContain('../ConcivWidget/Sources')
    expect(prompt()).not.toContain('Extra Swift sources')
  })

  it('still describes the native overlay when the extension has no config', () => {
    const text = iosSystemPrompt(undefined, {cwd: '/Users/dev/pay'})
    expect(text).toContain('transparent WebView')
    expect(text).not.toContain('Your working directory is')
  })

  it('explains that swift edits need a build and a run, not hot reload', () => {
    expect(prompt()).toContain('no hot reload')
  })
})
