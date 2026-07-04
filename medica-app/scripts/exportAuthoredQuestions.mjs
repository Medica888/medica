// One-time/on-demand export of the local authored question bank to JSON, consumed by
// server/src/db/seedAuthoredQuestions.ts to populate the backend-driven QBank catalog.
// Re-run this (and re-run the server seed script) whenever questionBanks/*.js changes.
//
// Deliberately imports only leaf lib modules (questionBanks, questionQualityRegistry,
// questionDedup, questionValidation) instead of mockQuestions.js/storage.js — those pull
// in apiClient.js, which reads import.meta.env at module scope and only Vite (not plain
// Node) populates it.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BALANCED_QUESTIONS } from '../src/lib/questionBanks/balancedQuestions.js'
import { NBME_QUESTIONS } from '../src/lib/questionBanks/nbmeQuestions.js'
import { UWORLD_QUESTIONS } from '../src/lib/questionBanks/uworldQuestions.js'
import { COVERAGE_EXPANSION_QUESTIONS } from '../src/lib/questionBanks/coverageExpansionQuestions.js'
import { isQuarantined } from '../src/lib/questionQualityRegistry.js'
import { dedupeQuestionList } from '../src/lib/questionDedup.js'
import { validateHardDifficultyQuestion } from '../src/lib/questionValidation.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outPath = join(__dirname, '../../server/src/db/seed-data/authoredQuestions.json')

const rawQuestions = [
  ...BALANCED_QUESTIONS,
  ...COVERAGE_EXPANSION_QUESTIONS,
  ...NBME_QUESTIONS,
  ...UWORLD_QUESTIONS,
]

const activeQuestions = dedupeQuestionList(rawQuestions.filter(q => !isQuarantined(q.id)))
const skippedCount = rawQuestions.length - activeQuestions.length

const passing = []
const failures = []
for (const question of activeQuestions) {
  const reasons = validateHardDifficultyQuestion(question)
  if (reasons.length === 0) passing.push(question)
  else failures.push({ id: question.id, reasons })
}

console.log(`Validated: ${activeQuestions.length}`)
console.log(`Exported: ${failures.length === 0 ? passing.length : 0}`)
console.log(`Skipped: ${skippedCount}`)
console.log(`Failed: ${failures.length}`)

if (failures.length > 0) {
  console.error('\nExport aborted — the following active authored questions failed validation:')
  for (const failure of failures) {
    console.error(`  ${failure.id}: ${failure.reasons.join(', ')}`)
  }
  process.exit(1)
}

mkdirSync(dirname(outPath), { recursive: true })
writeFileSync(outPath, `${JSON.stringify(passing, null, 2)}\n`)

console.log(`\nExported ${passing.length} authored questions to ${outPath}`)
