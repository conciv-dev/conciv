import {createRequire} from 'node:module'

export default createRequire(import.meta.url).resolve('@silvia-odwyer/photon-node/photon_rs_bg.wasm')
