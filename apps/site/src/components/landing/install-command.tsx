import {ShikiMagicMovePrecompiled} from '@shikijs/magic-move/react'
import {useReducedMotion} from 'motion/react'
import type {ReactNode} from 'react'
import '@shikijs/magic-move/style.css'
import {PackageInstallerCommand, PackageInstallerTabs} from '@/components/ui/package-installer-tabs'
import {
  INSTALL_COMMANDS,
  installCommandFor,
  selectPackageInstaller,
  usePackageInstaller,
} from '@/lib/package-installer-store'
import {cn} from '@/lib/utils'
import {INSTALL_COMMAND_STEP_IDS, INSTALL_COMMAND_STEPS} from './framework-snippets.gen'
import {magicMoveOptions} from './magic-move-options'

const WIDEST_COMMAND = INSTALL_COMMANDS.reduce(
  (widest, entry) => (entry.command.length > widest.length ? entry.command : widest),
  '',
)

export function InstallCommand({action, className}: {action?: ReactNode; className?: string}) {
  const installer = usePackageInstaller()
  const active = installCommandFor(installer)
  const shouldReduceMotion = useReducedMotion()
  const step = Math.max(0, INSTALL_COMMAND_STEP_IDS.indexOf(active.id))

  return (
    <PackageInstallerTabs
      commands={INSTALL_COMMANDS}
      value={installer}
      onValueChange={selectPackageInstaller}
      className={cn('inline-flex max-w-full flex-col items-start gap-2', className)}
      listClassName="max-md:hidden"
    >
      <div className="flex max-w-full flex-wrap items-center gap-2">
        <PackageInstallerCommand command={active.command} widestCommand={WIDEST_COMMAND}>
          <ShikiMagicMovePrecompiled
            steps={INSTALL_COMMAND_STEPS}
            step={step}
            options={magicMoveOptions(shouldReduceMotion)}
          />
        </PackageInstallerCommand>
        {action}
      </div>
    </PackageInstallerTabs>
  )
}
