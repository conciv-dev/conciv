import defaultMdxComponents from 'fumadocs-ui/mdx'
import * as TabsComponents from 'fumadocs-ui/components/tabs'
import * as FilesComponents from 'fumadocs-ui/components/files'
import * as Twoslash from 'fumadocs-twoslash/ui'
import {Step, Steps} from 'fumadocs-ui/components/steps'
import {TypeTable} from 'fumadocs-ui/components/type-table'
import {Accordion, Accordions} from 'fumadocs-ui/components/accordion'
import {ImageZoom} from 'fumadocs-ui/components/image-zoom'
import {Callout} from './docs-callout'
import {Tab, Tabs} from './docs-tabs'
import {
  CodeBlockPre,
  CodeBlockTab,
  CodeBlockTabs,
  CodeBlockTabsList,
  CodeBlockTabsTrigger,
  PopupContent,
  PopupTrigger,
} from './docs-code'
import {Mermaid} from './mermaid'
import {Playground} from './playground'
import {ConfigOptions, TestRunnerOptions} from './config-options'
import {CliCommands, HarnessTable} from './reference-tables'
import {AgentPrompt, CopyPrompt, SetupPrompt} from './setup-prompt'
import {No, Partly, Yes} from './comparison-status'
import {InstallSteps} from './landing/install-steps'
import type {MDXComponents} from 'mdx/types'

function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    ...TabsComponents,
    Tabs,
    Tab,
    ...FilesComponents,
    ...Twoslash,
    PopupContent,
    PopupTrigger,
    pre: CodeBlockPre,
    CodeBlockTabs,
    CodeBlockTabsList,
    CodeBlockTabsTrigger,
    CodeBlockTab,
    Callout,
    Step,
    Steps,
    TypeTable,
    Accordion,
    Accordions,
    ImageZoom,
    Mermaid,
    Playground,
    ConfigOptions,
    TestRunnerOptions,
    CliCommands,
    HarnessTable,
    SetupPrompt,
    CopyPrompt,
    AgentPrompt,
    InstallSteps,
    Yes,
    Partly,
    No,
    ...components,
  } satisfies MDXComponents
}

export const useMDXComponents = getMDXComponents

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>
}
