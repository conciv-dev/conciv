import defaultMdxComponents from 'fumadocs-ui/mdx'
import * as TabsComponents from 'fumadocs-ui/components/tabs'
import * as FilesComponents from 'fumadocs-ui/components/files'
import * as Twoslash from 'fumadocs-twoslash/ui'
import {Step, Steps} from 'fumadocs-ui/components/steps'
import {TypeTable} from 'fumadocs-ui/components/type-table'
import {Accordion, Accordions} from 'fumadocs-ui/components/accordion'
import {ImageZoom} from 'fumadocs-ui/components/image-zoom'
import {Mermaid} from './mermaid'
import {ConfigOptions} from './config-options'
import {CopyPrompt, SetupPrompt} from './setup-prompt'
import type {MDXComponents} from 'mdx/types'

function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    ...TabsComponents,
    ...FilesComponents,
    ...Twoslash,
    Step,
    Steps,
    TypeTable,
    Accordion,
    Accordions,
    ImageZoom,
    Mermaid,
    ConfigOptions,
    SetupPrompt,
    CopyPrompt,
    ...components,
  } satisfies MDXComponents
}

export const useMDXComponents = getMDXComponents

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>
}
