import {defineExtension} from '@conciv/extension'
import {TEST_RUNNER_NAME, TEST_RUNNER_PROMPT, testRunnerConfig} from './shared/meta.js'
import {testToolClient} from './tool/client.js'

export default defineExtension({
  name: TEST_RUNNER_NAME,
  configSchema: testRunnerConfig,
  tools: [testToolClient],
  systemPrompt: TEST_RUNNER_PROMPT,
})
