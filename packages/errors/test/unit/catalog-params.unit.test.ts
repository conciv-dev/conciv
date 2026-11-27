import {expect, test} from 'vitest'
import type {RegisteredErrorCatalogs} from 'evlog'
import type {NoneOrOffenders, ParamKeys, WalkedCatalogs} from '../utils/reserved-params.js'

test('no catalog message takes a param evlog reserves for its own options', () => {
  const offenders: NoneOrOffenders = 'none'
  const walked: Extract<WalkedCatalogs, 'site' | 'session'>[] = ['site', 'session']
  const read: ParamKeys<RegisteredErrorCatalogs['site']['DOCS_ICON_UNKNOWN']> = 'name'
  expect({offenders, walked, read}).toEqual({offenders: 'none', walked: ['site', 'session'], read: 'name'})
})
