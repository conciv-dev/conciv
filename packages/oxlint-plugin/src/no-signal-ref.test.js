import {describe, it} from 'vitest'
import {RuleTester} from 'oxlint/plugins-dev'
import rule from './no-signal-ref.js'

RuleTester.describe = describe
RuleTester.it = it

const tester = new RuleTester()
const filename = 'view.tsx'
const signal = 'const [el, setEl] = createSignal()\n'
const refError = [{messageId: 'signalOnlyForRef', data: {getter: 'el', setter: 'setEl'}}]

tester.run('no-signal-ref', rule, {
  valid: [
    {
      name: 'a getter read while rendering',
      code: `${signal}const view = <div ref={setEl}>{el() ? 'a' : 'b'}</div>`,
      filename,
    },
    {
      name: 'a getter read in an effect',
      code: `${signal}createEffect(() => el())\nconst view = <div ref={setEl} />`,
      filename,
    },
    {name: 'a getter passed on', code: `${signal}use(el)\nconst view = <div ref={setEl} />`, filename},
    {name: 'a setter called', code: `${signal}setEl(node)\nconst view = <div ref={setEl} />`, filename},
    {name: 'a setter never used', code: signal, filename},
    {
      name: 'a handler that is also called',
      code: `${signal}const focus = () => el().focus()\nfocus()\nconst view = <div ref={setEl} onClick={focus} />`,
      filename,
    },
    {
      name: 'a signal that is not destructured',
      code: 'const box = createSignal()\nconst view = <div ref={box[1]} />',
      filename,
    },
  ],
  invalid: [
    {name: 'a getter never read', code: `${signal}const view = <div ref={setEl} />`, filename, errors: refError},
    {
      name: 'a getter read in an inline handler',
      code: `${signal}const view = <div ref={setEl} onClick={() => el().focus()} />`,
      filename,
      errors: refError,
    },
    {
      name: 'a getter read in a named handler',
      code: `${signal}function focus() {\n  el().focus()\n}\nconst view = <div ref={setEl} onClick={focus} />`,
      filename,
      errors: refError,
    },
  ],
})
