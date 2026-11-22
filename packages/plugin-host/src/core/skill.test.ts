import {describe, test} from 'vitest'
import {createEngine, TestLLM} from '@conciv/plugin-testkit'

describe.concurrent('skills', () => {
  test("the model loads a skill a plugin's skill.transform rewrote and gets the rewritten body", async ({expect}) => {
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/skill-shaper']})
    await engine.reply(TestLLM.toolCall('c1', 'skill', {id: 'conciv'}), TestLLM.text('Loaded'))

    await engine.session.send('Tell me about conciv')

    expect((await engine.requests())[1]?.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'tool',
          toolCallId: 'c1',
          content: expect.stringContaining('Conciv, rewritten by the skill-shaper plugin.'),
        }),
      ]),
    )
  })

  test('the skill tool loads the built-in conciv and report skills', async ({expect}) => {
    const engine = await createEngine()

    expect(await engine.session.tool('skill').call({id: 'conciv'})).toEqual({
      name: 'conciv',
      directory: 'skill://conciv',
      output: expect.stringContaining('<skill_content name="conciv">'),
    })
    expect(await engine.session.tool('skill').call({id: 'report'})).toEqual({
      name: 'Report',
      directory: 'skill://report',
      output: expect.stringContaining('## Runtime Diagnostics Snapshot'),
    })
  })

  test('a skill written into the project while the engine runs is found after the rescan', async ({expect}) => {
    const engine = await createEngine({}, {fs: {filewatcher: true}})

    const before = await engine.session.tool('skill').failure({id: 'fresh'})
    expect(JSON.parse(before.message)).toEqual({
      error: {message: expect.stringContaining('Unable to load skill fresh')},
    })
    const updated = await engine.event('skill.updated')
    await engine.write(
      'conciv/skills/fresh/SKILL.md',
      '---\nname: Fresh\ndescription: Use for anything fresh.\n---\n\nKeep it fresh.\n',
    )
    await updated.arrived

    expect(await engine.session.tool('skill').call({id: 'fresh'})).toEqual({
      name: 'Fresh',
      directory: expect.stringContaining('/conciv/skills/fresh'),
      output: expect.stringContaining('Keep it fresh.'),
    })
  })

  test("skills the model may invoke on its own are listed in its system prompt, the others are not, and the skill tool loads one from the project's conciv/skills folder", async ({
    expect,
  }) => {
    const engine = await createEngine({}, {directory: './test/fixtures/projects/skilled'})
    await engine.reply(TestLLM.text('Hello'))

    await engine.session.send('Hi')

    const system = (await engine.requests())[0]?.system
    expect(system).toEqual(
      expect.arrayContaining([
        expect.stringMatching(
          /<available_skills>[\s\S]*<id>conciv<\/id>[\s\S]*<id>house-style<\/id>[\s\S]*<\/available_skills>/,
        ),
      ]),
    )
    expect(system).toEqual(expect.not.arrayContaining([expect.stringContaining('<id>manual-only</id>')]))
    expect(await engine.session.tool('skill').call({id: 'house-style'})).toEqual({
      name: 'House style',
      directory: expect.stringContaining('/test/fixtures/projects/skilled/conciv/skills/house-style'),
      output: expect.stringContaining('Write every heading in sentence case.'),
    })
  })
})
