import {prebuildFixtureHost} from '@conciv/extension-testkit'
import {clientEntry} from './canvas-it-helpers.js'

export default async function setup(): Promise<void> {
  await prebuildFixtureHost(clientEntry)
}
