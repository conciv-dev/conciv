import {baseOptions} from '@/lib/layout.shared'
import {HomeLayout} from 'fumadocs-ui/layouts/home'
import {DefaultNotFound} from 'fumadocs-ui/layouts/home/not-found'
import {GitHubStarLink} from './landing/github-star-link'

export function NotFound() {
  return (
    <HomeLayout {...baseOptions()} links={[{type: 'custom', children: <GitHubStarLink />}]}>
      <DefaultNotFound />
    </HomeLayout>
  )
}
