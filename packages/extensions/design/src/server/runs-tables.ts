import {extensionTable} from '@conciv/db'
import {designTables} from './tables.js'

const {fom_nodes: _view, ...tables} = designTables(extensionTable('design'), 'runs')

export const runsTables = tables
