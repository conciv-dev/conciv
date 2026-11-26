import {define, type Context} from '@conciv/backend-plugin-api/effect/plugin'
import {Effect} from 'effect'
import {AbsolutePath} from '@conciv/protocol/schema/schema'
import * as Skill from '@conciv/backend-app-api/core/skill'
import * as ConfigPluginSource from '@conciv/backend-app-api/core/config/plugin/source'
import os from 'os'
import concivContent from './skill/conciv.md'
import reportContent from './skill/report.md'

const CONCIV_DESCRIPTION =
  'Use this skill for any question about conciv itself, including how conciv works, installing or configuring it, choosing a harness, using the widget, the conciv CLI, extending conciv with tools and widget UI, and troubleshooting it.'
const REPORT_DESCRIPTION =
  'Use when the user wants to report a conciv issue or bug. Collect standard diagnostics, add user-specific reproduction context, and publish the issue with GitHub CLI.'

export const Plugin = define({
  id: 'conciv.skill',
  effect: Effect.fn(function* (ctx) {
    const report = yield* reportContentWithDiagnostics(ctx.app)
    yield* ctx.skill.transform((editor) => {
      editor.add(
        Skill.Info.make({
          id: Skill.Id.make('conciv'),
          name: Skill.Name.make('conciv'),
          description: CONCIV_DESCRIPTION,
          path: AbsolutePath.make('skill://conciv/SKILL.md'),
          content: concivContent,
        }),
      )
      editor.add(
        Skill.Info.make({
          id: Skill.Id.make('report'),
          name: Skill.Name.make('Report'),
          description: REPORT_DESCRIPTION,
          path: AbsolutePath.make('skill://report/SKILL.md'),
          content: report,
        }),
      )
    })
  }),
})

const reportContentWithDiagnostics = Effect.fn('SkillPlugin.reportContentWithDiagnostics')(function* (
  app: Context['app'],
) {
  const plugins = yield* configuredPlugins()
  const emulated =
    process.platform === 'win32' && os.arch() === 'x64' && process.env['PROCESSOR_IDENTIFIER']?.startsWith('ARM')
  return [
    reportContent,
    '',
    '## Runtime Diagnostics Snapshot',
    '',
    'These values were captured when the built-in report skill was registered. Verify them before publishing.',
    '',
    `- conciv version: ${app.version}`,
    `- Node: ${process.version}`,
    `- OS: ${os.type()} ${os.release()} (${os.platform()} ${os.arch()}${emulated ? ', emulated on ARM64' : ''})`,
    `- Active plugins: ${plugins.length === 0 ? 'None found in config' : plugins.join(', ')}`,
  ].join('\n')
})

const configuredPlugins = Effect.fn('SkillPlugin.configuredPlugins')(function* () {
  return (yield* ConfigPluginSource.ConfiguredPlugins)
    .map((entry) => (typeof entry === 'string' ? entry : entry[0]))
    .toSorted()
})
