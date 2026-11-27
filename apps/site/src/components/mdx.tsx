import defaultMdxComponents from 'fumadocs-ui/mdx'
import * as TabsComponents from 'fumadocs-ui/components/tabs'
import * as FilesComponents from 'fumadocs-ui/components/files'
import * as Twoslash from 'fumadocs-twoslash/ui'
import {Step, Steps} from 'fumadocs-ui/components/steps'
import {TypeTable} from 'fumadocs-ui/components/type-table'
import {Accordion, Accordions} from 'fumadocs-ui/components/accordion'
import {ImageZoom} from 'fumadocs-ui/components/image-zoom'
import {Callout} from './docs-callout'
import {CodeBlockPre, CodeBlockTab, CodeBlockTabs, CodeBlockTabsList, PopupContent} from './docs-code'
import {Mermaid} from './mermaid'
import {Playground} from './playground'
import {ConfigOptions, TestRunnerOptions} from './config-options'
import {CliCommands, HarnessTable} from './reference-tables'
import {CopyPrompt, SetupPrompt} from './setup-prompt'
import type {MDXComponents} from 'mdx/types'

function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    ...TabsComponents,
    ...FilesComponents,
    ...Twoslash,
    PopupContent,
    pre: CodeBlockPre,
    CodeBlockTabs,
    CodeBlockTabsList,
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
    ...components,
  } satisfies MDXComponents
}

export const useMDXComponents = getMDXComponents

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>
}
