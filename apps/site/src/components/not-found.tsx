import {baseOptions} from '@/lib/layout.shared'
import {HomeLayout} from 'fumadocs-ui/layouts/home'
import {DefaultNotFound} from 'fumadocs-ui/layouts/home/not-found'
import {GitHubStarsButton} from './github-stars-button'

export function NotFound() {
  return (
    <HomeLayout {...baseOptions()} links={[{type: 'custom', children: <GitHubStarsButton />}]}>
      <DefaultNotFound />
    </HomeLayout>
  )
}
