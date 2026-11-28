import {describe, it} from 'vitest'
import {RuleTester} from 'oxlint/plugins-dev'
import rule from '../../src/no-inner-html.js'

RuleTester.describe = describe
RuleTester.it = it

const tester = new RuleTester()
const filename = 'view.tsx'
const htmlWrite = (name) => [{messageId: 'htmlWrite', data: {name}}]

tester.run('no-inner-html', rule, {
  valid: [
    {name: 'reading innerHTML', code: 'const markup = element.innerHTML', filename},
    {name: 'reading outerHTML', code: 'const markup = node.outerHTML', filename},
    {name: 'setting text', code: "element.textContent = 'Count is 1'", filename},
    {name: 'emptying with replaceChildren', code: 'mount.replaceChildren()', filename},
    {name: 'a write on another object', code: "stream.write('chunk')", filename},
    {name: 'a JSX text child', code: 'const view = <div>{text}</div>', filename},
  ],
  invalid: [
    {name: 'assigning innerHTML', code: 'element.innerHTML = markup', filename, errors: htmlWrite('innerHTML')},
    {name: 'clearing with innerHTML', code: "mount.innerHTML = ''", filename, errors: htmlWrite('innerHTML')},
    {name: 'assigning outerHTML', code: 'node.outerHTML = markup', filename, errors: htmlWrite('outerHTML')},
    {
      name: 'a computed innerHTML key',
      code: "element['innerHTML'] = markup",
      filename,
      errors: htmlWrite('innerHTML'),
    },
    {name: 'appending to innerHTML', code: 'element.innerHTML += markup', filename, errors: htmlWrite('innerHTML')},
    {
      name: 'insertAdjacentHTML',
      code: "element.insertAdjacentHTML('beforeend', markup)",
      filename,
      errors: htmlWrite('insertAdjacentHTML'),
    },
    {name: 'document.write', code: 'document.write(markup)', filename, errors: htmlWrite('write')},
    {name: 'document.writeln', code: 'document.writeln(markup)', filename, errors: htmlWrite('writeln')},
    {
      name: 'a Solid innerHTML prop',
      code: 'const view = <div innerHTML={markup} />',
      filename,
      errors: htmlWrite('innerHTML'),
    },
  ],
})
