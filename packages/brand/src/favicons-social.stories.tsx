import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import favicon32 from '../assets/favicon/favicon-32.png'
import appleTouchIcon from '../assets/favicon/apple-touch-icon.png'
import icon192 from '../assets/favicon/icon-192.png'
import maskable512 from '../assets/favicon/maskable-512.png'
import avatarCrimson from '../assets/social/avatar-crimson-500.png'
import avatarCharcoal from '../assets/social/avatar-charcoal-500.png'
import ogDefault from '../assets/social/og-default-1200x630.png'
import twitterCard from '../assets/social/twitter-1200x600.png'
import readmeBanner from '../assets/social/readme-banner-1280x320.png'

const meta: Meta = {title: 'brand/Favicons & Social'}
export default meta
type Story = StoryObj

function Tile(props: {label: string; src: string; size: string}) {
  return (
    <figure class="flex flex-col gap-2 items-center">
      <img src={props.src} alt={props.label} style={{width: props.size, height: props.size, 'object-fit': 'contain'}} />
      <figcaption class="text-xs">{props.label}</figcaption>
    </figure>
  )
}

export const Favicons: Story = {
  render: () => (
    <div class="flex flex-wrap gap-6 items-end">
      <Tile label="favicon-32.png" src={favicon32} size="32px" />
      <Tile label="apple-touch-icon 180" src={appleTouchIcon} size="90px" />
      <Tile label="icon-192" src={icon192} size="96px" />
      <Tile label="maskable-512" src={maskable512} size="96px" />
    </div>
  ),
}

export const SocialAvatars: Story = {
  render: () => (
    <div class="flex gap-6 items-end">
      <Tile label="avatar-crimson-500" src={avatarCrimson} size="120px" />
      <Tile label="avatar-charcoal-500" src={avatarCharcoal} size="120px" />
    </div>
  ),
}

export const SocialBanners: Story = {
  render: () => (
    <div class="flex flex-col gap-4">
      <figure class="flex flex-col gap-2">
        <img src={ogDefault} alt="og-default 1200x630" class="max-w-md w-full" />
        <figcaption class="text-xs">og-default-1200x630</figcaption>
      </figure>
      <figure class="flex flex-col gap-2">
        <img src={twitterCard} alt="twitter card 1200x600" class="max-w-md w-full" />
        <figcaption class="text-xs">twitter-1200x600</figcaption>
      </figure>
      <figure class="flex flex-col gap-2">
        <img src={readmeBanner} alt="readme banner 1280x320" class="max-w-md w-full" />
        <figcaption class="text-xs">readme-banner-1280x320</figcaption>
      </figure>
    </div>
  ),
}
