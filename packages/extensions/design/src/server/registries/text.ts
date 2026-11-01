import type {Registries} from '../../shared/types.js'
import {paddleReader} from '../comparators/paddle.js'

export const text: Registries['text'] = {paddle: paddleReader}
