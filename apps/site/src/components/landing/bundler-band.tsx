import {LogoLoop, type LogoItem} from '@/components/LogoLoop'

const BUNDLERS = [
  {icon: '/icons/vite.svg', name: 'Vite', href: '/docs/quick-start/vite'},
  {icon: '/icons/nextjs.svg', name: 'Next.js', href: '/docs/quick-start/nextjs'},
  {icon: '/icons/webpack.svg', name: 'webpack', href: '/docs/quick-start/webpack'},
  {icon: '/icons/rspack.svg', name: 'Rspack', href: '/docs/quick-start/rspack'},
  {icon: '/icons/rollup.svg', name: 'Rollup', href: '/docs/quick-start/rollup'},
  {icon: '/icons/esbuild.svg', name: 'esbuild', href: '/docs/quick-start/esbuild'},
]

const LOGOS: LogoItem[] = BUNDLERS.map(({icon, name, href}) => ({
  href,
  title: name,
  ariaLabel: name,
  node: (
    <span className="inline-flex items-center gap-2.5 font-mono text-sm font-semibold text-muted-foreground opacity-70 grayscale transition-[opacity,filter,color] duration-200 hover:text-foreground hover:opacity-100 hover:grayscale-0">
      <img src={icon} alt="" className="size-[18px]" loading="lazy" />
      {name}
    </span>
  ),
}))

export function BundlerBand() {
  return (
    <section className="border-y bg-background/50 py-4">
      <p className="mb-2.5 text-center font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        One plugin · every bundler
      </p>
      <LogoLoop
        logos={LOGOS}
        speed={36}
        gap={48}
        logoHeight={20}
        pauseOnHover
        fadeOut
        fadeOutColor="var(--od-paper)"
        ariaLabel="Supported bundlers"
        className="mx-auto max-w-[1180px]"
      />
    </section>
  )
}
