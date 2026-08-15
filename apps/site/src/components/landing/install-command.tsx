import {Tabs as TabsPrimitive} from 'radix-ui'
import {useEffect, useState} from 'react'
import {CopyButton} from './copy-button'

type InstallCli = 'npm' | 'pnpm' | 'bun' | 'yarn'

const INSTALL_CLIS: InstallCli[] = ['npm', 'pnpm', 'bun', 'yarn']

const COMMANDS: Record<InstallCli, string> = {
  npm: 'npm i -D @conciv/it',
  pnpm: 'pnpm add -D @conciv/it',
  bun: 'bun add -d @conciv/it',
  yarn: 'yarn add -D @conciv/it',
}

const STORAGE_KEY = 'conciv.pm'

const INSTALL_CLI_SET: Set<string> = new Set(INSTALL_CLIS)

function isInstallCli(value: string): value is InstallCli {
  return INSTALL_CLI_SET.has(value)
}

function usePersistedInstallCli(): [InstallCli, (value: string) => void] {
  const [installCli, setInstallCli] = useState<InstallCli>('npm')

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored && isInstallCli(stored)) setInstallCli(stored)
  }, [])

  const selectInstallCli = (value: string) => {
    if (!isInstallCli(value)) return
    setInstallCli(value)
    window.localStorage.setItem(STORAGE_KEY, value)
  }

  return [installCli, selectInstallCli]
}

function CommandLine({command}: {command: string}) {
  return (
    <div className="inline-flex items-center gap-2.5 rounded-lg border bg-secondary py-2 pl-3.5 pr-2 font-mono text-[13px]">
      <span className="text-primary">$</span>
      <span>{command}</span>
      <span className="ml-1">
        <CopyButton.Root text={command}>
          <CopyButton.Trigger label="Copy install command" />
          <CopyButton.Feedback />
        </CopyButton.Root>
      </span>
    </div>
  )
}

export function InstallCommand({compact = false}: {compact?: boolean}) {
  const [installCli, selectInstallCli] = usePersistedInstallCli()

  if (compact) return <CommandLine command={COMMANDS[installCli]} />

  return (
    <TabsPrimitive.Root value={installCli} onValueChange={selectInstallCli}>
      <TabsPrimitive.List
        aria-label="Package manager"
        className="mb-2 inline-flex gap-0.5 rounded-md border bg-card p-[3px]"
      >
        {INSTALL_CLIS.map((cli) => (
          <TabsPrimitive.Trigger
            key={cli}
            value={cli}
            className="rounded-[5px] px-2.5 py-1 font-mono text-[12px] text-muted-foreground transition-colors duration-150 hover:text-foreground data-[state=active]:bg-background data-[state=active]:text-foreground"
          >
            {cli}
          </TabsPrimitive.Trigger>
        ))}
      </TabsPrimitive.List>
      {INSTALL_CLIS.map((cli) => (
        <TabsPrimitive.Content key={cli} value={cli}>
          <CommandLine command={COMMANDS[cli]} />
        </TabsPrimitive.Content>
      ))}
    </TabsPrimitive.Root>
  )
}
