import {describe, expect, it} from 'vitest'
import {collectClientTools, type ClientToolCtx} from '@conciv/extension'
import pageExtension from '../src/client.js'
import {PAGE_TOOL_PREFIX, PAGE_TOOL_DEFS} from '../src/shared/defs.js'

describe('page tools', () => {
  const findDeclaredOutput = (verb: string) => {
    const tool = PAGE_TOOL_DEFS.find((candidate) => candidate.name === `${PAGE_TOOL_PREFIX}${verb}`)
    const output = tool?.outputSchema
    if (!output) throw new Error(`no page tool declares an output for page_${verb}`)
    return output
  }

  describe('page reload', () => {
    const documentOnly = (): never => {
      throw new Error('page_reload must read nothing but the document it was handed')
    }

    const ctxOver = (target: Document): ClientToolCtx => ({
      agentId: 'test-agent',
      document: target,
      target: documentOnly,
      resolve: documentOnly,
      addRef: documentOnly,
      resetRefs: documentOnly,
      consoleEntries: documentOnly,
      effects: [],
    })

    const nextLoad = (frame: HTMLIFrameElement): Promise<void> =>
      new Promise((resolve) => frame.addEventListener('load', () => resolve(), {once: true}))

    it('resolves on initiation and the handed-in page really navigates', async () => {
      const reload = collectClientTools([pageExtension]).find((entry) => entry.name === 'page_reload')
      if (!reload) throw new Error('no page_reload client tool is mounted')
      const frame = document.createElement('iframe')
      frame.srcdoc = '<p id="kept">kept</p>'
      const firstLoad = nextLoad(frame)
      document.body.appendChild(frame)
      await firstLoad
      const framed = frame.contentDocument
      if (!framed) throw new Error('the fixture frame has no document')
      framed.body.appendChild(Object.assign(framed.createElement('span'), {id: 'scribbled'}))
      expect(framed.getElementById('scribbled')).not.toBeNull()

      const reloaded = nextLoad(frame)
      const result = await reload.execute({}, ctxOver(framed))
      expect(findDeclaredOutput('reload').parse(result)).toEqual({ok: true, initiated: true})

      await reloaded
      const after = frame.contentDocument
      expect(after?.getElementById('kept')).not.toBeNull()
      expect(after?.getElementById('scribbled')).toBeNull()
      frame.remove()
    }, 10_000)
  })
})
