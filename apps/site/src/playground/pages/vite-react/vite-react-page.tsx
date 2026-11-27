import type {PageState} from '@/playground/script'
import heroImage from './hero.png'
import reactLogo from './react.svg'
import viteLogo from './vite.svg'
import icons from './icons.svg?url'

const LINK =
  'flex gap-2 items-center rounded-md bg-[#f4f3ec80] px-3 py-1.5 text-base text-[#08060d] no-underline transition-shadow hover:shadow-lg dark:bg-[#2f303a80] dark:text-[#f3f4f6]'

const SECTION = 'flex-1 p-8 max-lg:px-5 max-lg:py-6'

const HEADING = 'mb-2 text-2xl font-medium text-[#08060d] dark:text-[#f3f4f6]'

function Icon({id, className}: {id: string; className: string}) {
  return (
    <svg className={className} role="presentation" aria-hidden="true">
      <use href={`${icons}#${id}`} />
    </svg>
  )
}

function Ticks() {
  return (
    <div className="relative w-full before:absolute before:-top-[4.5px] before:left-0 before:border-5 before:border-transparent before:border-l-[#e5e4e7] before:content-[''] after:absolute after:-top-[4.5px] after:right-0 after:border-5 after:border-transparent after:border-r-[#e5e4e7] after:content-[''] dark:before:border-l-[#2e303a] dark:after:border-r-[#2e303a]" />
  )
}

export function ViteReactPage({page, onCount}: {page: PageState; onCount: () => void}) {
  return (
    <div className="min-h-svh bg-white pr-134 text-[18px] leading-[145%] tracking-[0.18px] text-[#6b6375] dark:bg-[#16171d] dark:text-[#9ca3af]">
      <div className="mx-auto flex min-h-svh w-[1126px] max-w-full flex-col border-x border-[#e5e4e7] text-center dark:border-[#2e303a]">
        <section className="flex grow flex-col place-content-center place-items-center gap-6 max-lg:px-5 max-lg:pt-8 max-lg:pb-6">
          <div className="relative">
            <img src={heroImage} className="relative z-0 mx-auto w-[170px]" width="170" height="179" alt="" />
            <img
              src={reactLogo}
              className="absolute inset-x-0 top-[34px] z-1 mx-auto h-7 [transform:perspective(2000px)_rotateZ(300deg)_rotateX(44deg)_rotateY(39deg)_scale(1.4)]"
              alt="React logo"
            />
            <img
              src={viteLogo}
              className="absolute inset-x-0 top-[107px] z-0 mx-auto h-[26px] w-auto [transform:perspective(2000px)_rotateZ(300deg)_rotateX(40deg)_rotateY(39deg)_scale(0.8)]"
              alt="Vite logo"
            />
          </div>
          <div>
            <h1 className="my-8 text-[56px] font-medium tracking-[-1.68px] text-[#08060d] max-lg:my-5 max-lg:text-4xl dark:text-[#f3f4f6]">
              {page.heading}
            </h1>
            <p>
              Edit{' '}
              <code className="rounded bg-[#f4f3ec] px-2 py-1 font-mono text-[15px] text-[#08060d] dark:bg-[#1f2028] dark:text-[#f3f4f6]">
                src/App.tsx
              </code>{' '}
              and save to test{' '}
              <code className="rounded bg-[#f4f3ec] px-2 py-1 font-mono text-[15px] text-[#08060d] dark:bg-[#1f2028] dark:text-[#f3f4f6]">
                HMR
              </code>
            </p>
          </div>
          <button
            type="button"
            className="counter mb-6 inline-flex rounded-[5px] border-2 border-transparent bg-[#aa3bff1a] px-2.5 py-1 font-mono text-base text-[#aa3bff] transition-colors hover:border-[#aa3bff80] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#aa3bff] dark:bg-[#c084fc26] dark:text-[#c084fc]"
            onClick={onCount}
          >
            {page.button} {page.count}
          </button>
        </section>
        <Ticks />
        <section className="flex border-t border-[#e5e4e7] text-left max-lg:flex-col max-lg:text-center dark:border-[#2e303a]">
          <div
            className={`${SECTION} border-r border-[#e5e4e7] max-lg:border-r-0 max-lg:border-b dark:border-[#2e303a]`}
          >
            <Icon id="documentation-icon" className="mb-4 size-[22px]" />
            <h2 className={HEADING}>Documentation</h2>
            <p>Your questions, answered</p>
            <ul className="mt-8 flex list-none gap-2 p-0 max-lg:mt-5 max-lg:flex-wrap max-lg:justify-center">
              <li>
                <a className={LINK} href="https://vite.dev/" target="_blank" rel="noreferrer">
                  <img className="h-[18px]" src={viteLogo} alt="" />
                  Explore Vite
                </a>
              </li>
              <li>
                <a className={LINK} href="https://react.dev/" target="_blank" rel="noreferrer">
                  <img className="size-[18px]" src={reactLogo} alt="" />
                  Learn more
                </a>
              </li>
            </ul>
          </div>
          <div className={SECTION}>
            <Icon id="social-icon" className="mb-4 size-[22px]" />
            <h2 className={HEADING}>Connect with us</h2>
            <p>Join the Vite community</p>
            <ul className="mt-8 flex list-none gap-2 p-0 max-lg:mt-5 max-lg:flex-wrap max-lg:justify-center">
              <li>
                <a className={LINK} href="https://github.com/vitejs/vite" target="_blank" rel="noreferrer">
                  <Icon id="github-icon" className="size-[18px] dark:invert" />
                  GitHub
                </a>
              </li>
              <li>
                <a className={LINK} href="https://chat.vite.dev/" target="_blank" rel="noreferrer">
                  <Icon id="discord-icon" className="size-[18px] dark:invert" />
                  Discord
                </a>
              </li>
              <li>
                <a className={LINK} href="https://x.com/vite_js" target="_blank" rel="noreferrer">
                  <Icon id="x-icon" className="size-[18px] dark:invert" />
                  X.com
                </a>
              </li>
              <li>
                <a className={LINK} href="https://bsky.app/profile/vite.dev" target="_blank" rel="noreferrer">
                  <Icon id="bluesky-icon" className="size-[18px] dark:invert" />
                  Bluesky
                </a>
              </li>
            </ul>
          </div>
        </section>
        <Ticks />
        <section className="h-22 border-t border-[#e5e4e7] max-lg:h-12 dark:border-[#2e303a]" />
      </div>
    </div>
  )
}
