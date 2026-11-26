import {mergeConfig} from 'tsdown'
import config from './tsdown.config.ts'

export default mergeConfig(config, {clean: false, tsconfig: 'tsconfig.build.json', dts: {emitDtsOnly: true}})
