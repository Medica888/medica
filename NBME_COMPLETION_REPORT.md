# NBME Difficult Validator — Phase 5 Completion Report

**Date:** 2026-06-04
**Status:** COMPLETE

---

## 1. Audit Findings

The existing NBME Difficult validator (`scoreNbmeQuestion`) was found to be substantially complete and correctly isolated. Key findings:

**Isolation confirmed:**
- `scoreQuestion` returns early via `if (isNbmeDifficulty(difficulty)) return scoreNbmeQuestion(...)` — UWorld checks and difficulty-fit checks never execute for NBME.
- `checkUworldSpecific` is guarded by `if (difficulty === 'UWorld Challenge')` and cannot affect NBME.
- `checkDifficultyFit` has no NBME case and is unreachable for NBME due to early return.

**Rules already mirrored from frontend:**
All major NBME structural rules (`nbme_stem_too_short`, `missing_patient_anchor`, `weak_clinical_signal`, `weak_single_best_answer_lead_in`, `teaching_language_in_stem`, `weak_distractors`, `duplicate_options`, `insufficient_options`, `clue_leakage`, `answer_not_supported`, `contradictory_explanation`, `missing_option_explanations` in coach mode, `shallow_explanation` as soft) were already implemented.

**Gaps identified:**

| Gap | Type | Disposition |
|-----|------|-------------|
| `non_concise_nbme_options` (any option > 160 chars) | Real missing rule | **Added** |
| `contradictory_explanation` test missing for NBME | Test gap | **Added** |
| `missing_option_explanations` coach mode test missing | Test gap | **Added** |
| `duplicated_hard_options` (normalized meaning) | Deferred | False-positive risk; medical review covers it |
| Metadata validation (testedConcept, usmleContentArea, etc.) | Deferred | Enrichment timing issue |
| Option count > 6 | Deferred | AI never generates 7+ options; theoretical |

---

## 2. Tests Added (9 new tests)

### Inside existing `scoreNbmeOptionStyle` describe block (2 tests)
- `rejects any option longer than 160 characters` — direct unit test of `scoreNbmeOptionStyle` with one option at 171 chars
- `does not flag options at exactly 160 characters or fewer (boundary)` — boundary test at exactly 160

### New describe: `scoreNbmeQuestion — contradictory explanation` (1 test)
- `fails when explanation explicitly names a wrong option as correct` — exercise of `checkAnswerContradiction` via NBME path in practice mode

### New describe: `scoreNbmeQuestion — coach mode requires option explanations` (2 tests)
- `fails in coach mode when optionExplanations are absent`
- `passes in practice mode without optionExplanations` — confirms the gate is mode-specific

### New describe: `non_concise_nbme_options — scoreQuestion integration` (4 tests)
- NBME question with one > 160-char option fails with `non_concise_nbme_options`
- NBME question with concise options does not fire the rule
- Balanced question with a > 160-char option does NOT fire `non_concise_nbme_options` (NBME-only)
- UWorld question with a > 160-char option does NOT fire `non_concise_nbme_options` (NBME-only)

---

## 3. Rule Added

**`non_concise_nbme_options`** — added to `scoreNbmeOptionStyle` and `NBME_HARD_REJECTIONS`.

**Implementation** (`questionValidator.ts`):
```typescript
const hasTooLong = texts.some(t => t.length > 160);
if (hasTooLong) reasons.push('non_concise_nbme_options');
```

**Where it fires:** Only inside `scoreNbmeOptionStyle`, which is only called from `scoreNbmeQuestion`. It is structurally impossible for this reason to appear on Balanced, More Hard, More Easy, or UWorld questions.

**Why 160 chars:** This matches the frontend `validateNbmeDifficultyQuestion` threshold exactly. NBME-style options are designed to be short, specific single-best-answer choices. An option longer than 160 chars is a sign the AI has embedded an explanation into the option text rather than the explanation field.

**Repair guidance added:** `'non_concise_nbme_options': 'Shorten each option to ≤160 chars — NBME-style options are concise single best answers, not explanations'`

---

## 4. Why Metadata Rules Were Deferred

The frontend `validateNbmeDifficultyQuestion` also validates:
- `missing_tested_concept` / `missing_question_angle`
- `missing_usmle_content_area` / `missing_physician_task`
- `non_official_usmle_content_area` / `non_official_physician_task`

These were intentionally **not added** to the backend for the same reason as Phase 4: the client-side `enrichQuestionWithUsmleTaxonomy` function adds and normalizes these fields **after** the server returns questions. At server validation time, these fields may be absent without indicating a quality failure — they simply haven't been enriched yet. Enforcing their presence at the backend would cause false hard rejections on otherwise valid questions.

---

## 5. Final Test Results

```
npx vitest run src/lib/questionValidator.test.ts
  Tests: 269 passed (was 260, +9 new)

npx tsc --noEmit
  Clean — no errors

npm test (full suite, 18 files)
  Tests: 665 passed (was 656, +9)
```

---

## 6. Remaining Risks

| Risk | Assessment |
|------|-----------|
| `duplicated_hard_options` (normalized meaning) not implemented | Low: exact duplicates are caught; normalized-meaning near-duplicates are rare in AI output and caught by medical review |
| Metadata fields not validated | Low: client-side enrichment handles this; backend gap is by design, not oversight |
| Option count > 6 not validated | Negligible: current AI prompts specify 4 options; 5+ never generated in practice |
| `non_concise_nbme_options` threshold at 160 chars | Calibrated to match frontend exactly; no known false-positive risk for AI-generated NBME questions |

---

**Phase 5 is complete. No new phases started.**
