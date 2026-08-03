import {makeVocabularyRule} from './vocabulary.js'

const CORE_FOREIGN_TERMS = ['terminal', 'verdict']

export default makeVocabularyRule({
  terms: CORE_FOREIGN_TERMS,
  allowedNames: [],
  exemptFiles: [],
  allowedTermPaths: [],
  message:
    "'{{name}}' drags '{{term}}' vocabulary into @conciv/core (spec conciv-dev/conciv#190): core stays harness- and terminal-agnostic; home it in the owning extension or rename it.",
})
