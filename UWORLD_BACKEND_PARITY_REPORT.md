# UWorld Challenge Backend Parity — Phase 4 Report

**Date:** 2026-06-04
**Status:** COMPLETE

---

## 1. Audit Findings

### What the backend did for UWorld Challenge before Phase 4

UWorld Challenge fell through to the **general `scoreQuestion` path**, sharing all rules with Balanced and More Hard. The only UWorld-differentiated behaviors were:

| Behavior | Status |
|----------|--------|
| AI medical review required | ✓ active |
| `insufficient_reasoning_depth` (soft, Phase 3) | ✓ soft-only |
| `stem_too_short` (< 80 chars) | ✓ wrong threshold (80 not 180) |
| `no_clinical_vignette` | ✓ partially covers context |
| `shallow_explanation` (< 150 chars) | ✓ wrong threshold (150 not 350) |
| `answer_not_supported` | ✓ |
| `generic_option_present` | ✓ |
| `missing_option_explanations` (coach mode only) | ✓ coach only, not all UWorld modes |

### Frontend-only UWorld rules not on the backend (pre-Phase 4)

The frontend `validateHardDifficultyQuestion` in `mockQuestions.js` applied these additional checks only for `UWorld Challenge`:

| Rule | Frontend threshold |
|------|-------------------|
| `hard_stem_too_short` | stem < 180 chars |
| `missing_objective_data` | no lab/vital/imaging in stem |
| `hard_explanation_too_short` | explanation < 350 chars |
| `weak_hard_distractors` | any option < 12 chars |
| `low_plausibility_hard_options` | any option < 3 words or generic |
| `missing_uworld_option_explanations` | all 4 optionExplanations required (all modes) |
| `shallow_uworld_option_explanations` | any optionExplanation < 60 chars |
| `weak_wrong_option_teaching` | < 2 wrong options use contrast language |

---

## 2. Backend Gaps Fixed

### New function: `checkUworldSpecific(q, mode)` — exported, pure, testable

Called from `scoreQuestion` only when `difficulty === 'UWorld Challenge'`. Runs after the general checks. Returns an array of reason strings (empty = no UWorld-specific issues).

### Hard rejections added (6 new rules)

| Reason | Condition | Mode gate |
|--------|-----------|-----------|
| `uworld_stem_too_short` | `stem.length < 180` | All modes |
| `missing_objective_data` | No lab/vital/imaging in stem (`UWORLD_OBJECTIVE_DATA_RE`) | All modes |
| `hard_explanation_too_short` | `explanation.length < 350` | Practice/coach always; exam only if explanation non-empty |
| `weak_hard_distractors` | Any option < 12 chars OR < 3 words | All modes |
| `missing_uworld_option_explanations` | Not all A–D optionExplanations present | Practice/coach only |
| `shallow_uworld_option_explanations` | Any optionExplanation < 60 chars | Practice/coach only |

All 6 are added to `HARD_REJECTIONS` — they cause `validationStatus: 'fail'`.

### Soft reason added (1 new rule)

| Reason | Condition | Mode gate |
|--------|-----------|-----------|
| `weak_wrong_option_teaching` | < 2 wrong-option explanations use contrast language | Practice/coach only |

`weak_wrong_option_teaching` is **NOT** in `HARD_REJECTIONS` — it appears in `rejectionReasons` but cannot cause failure alone.

---

## 3. Exam-Mode Exception Explained

UWorld Challenge in exam mode is treated as follows:

| Check | Exam mode behavior |
|-------|-------------------|
| `uworld_stem_too_short` | **Always applies** — stem quality is mode-independent |
| `missing_objective_data` | **Always applies** — stem quality is mode-independent |
| `hard_explanation_too_short` | **Skipped if explanation is empty** (intentionally absent); applied if explanation is non-empty but too short |
| `weak_hard_distractors` | **Always applies** — option quality is mode-independent |
| `missing_uworld_option_explanations` | **Skipped** — optionExplanations are not required in exam mode |
| `shallow_uworld_option_explanations` | **Skipped** — paired with `missing_uworld_option_explanations` |
| `weak_wrong_option_teaching` | **Skipped** — teaching contrast requires explanations to exist |

This mirrors the existing pattern: `shallow_explanation` is already skipped in exam mode, and `missing_option_explanations` (coach-mode check) was already mode-gated.

---

## 4. Files Changed

### `server/src/lib/questionValidator.ts`
- Added 6 new reasons to `HARD_REJECTIONS`
- Added 7 new entries to `REPAIR_GUIDANCE` (6 hard + 1 soft)
- Added `UWORLD_OBJECTIVE_DATA_RE` constant (lab/vital/imaging pattern)
- Added `UWORLD_CONTRAST_RE` constant (contrast/teaching language pattern)
- Added `checkUworldSpecific(q, mode)` — exported function
- Added `difficulty === 'UWorld Challenge'` branch in `scoreQuestion` to call `checkUworldSpecific`
- Updated comment in `checkDifficultyFit` to note Phase 4 handles structural rules

### `server/src/lib/questionValidator.test.ts`
- Added `checkUworldSpecific` to imports
- Added 2 describe blocks with 35 new tests
- Updated 1 pre-existing test that documented pre-Phase-4 behavior (Test 13, exam-mode assertion)

### `routes/ai.ts` — NOT modified
`scoreQuestion` is already called there. The new UWorld checks apply automatically.

---

## 5. Tests Added (35 new tests)

### `checkUworldSpecific — unit tests` (21 tests)

Direct calls to `checkUworldSpecific(q, mode)`:

| Rule | Cases |
|------|-------|
| `uworld_stem_too_short` | fires at 179 chars; absent at 180+ |
| `missing_objective_data` | fires for narrative stem; absent when mg/dL or mmHg present |
| `hard_explanation_too_short` | fires at < 350 in practice; absent at 350+; absent in exam with empty expl; fires in exam with non-empty short expl |
| `weak_hard_distractors` | fires on < 12 chars; fires on < 3 words; absent when all good |
| `missing_uworld_option_explanations` | fires in practice; fires in coach; absent in exam; absent when all 4 present |
| `shallow_uworld_option_explanations` | fires when one < 60 chars; absent when all 60+; absent in exam; does not co-fire with missing |
| `weak_wrong_option_teaching` | fires with 0 contrast; absent with 2+ contrast; absent in exam |
| clean question | returns [] for fully valid practice question |

### `checkUworldSpecific — scoreQuestion integration` (14 tests)

End-to-end via `scoreQuestion(..., 'UWorld Challenge')`:

| Test | Assertion |
|------|-----------|
| Short stem | `uworld_stem_too_short` present → fail |
| Short explanation | `hard_explanation_too_short` present → fail |
| Weak distractors (1-word option) | `weak_hard_distractors` present → fail |
| Missing objective data | `missing_objective_data` present → fail |
| Practice missing optionExplanations | `missing_uworld_option_explanations` present → fail |
| Exam missing optionExplanations | neither explanation reason → no Phase 4 failure from this |
| `weak_wrong_option_teaching` alone | present but `validationStatus === 'pass'` |
| Well-formed UWorld question | no Phase 4 reason present → pass |
| NBME Difficult question | no UWorld-specific reasons |
| Balanced question | no UWorld-specific reasons |

### Pre-existing test updated (1)

`Test 13: both NBME and UWorld pass in exam mode` — split into two tests:
- NBME Difficult still passes with concise stem in exam mode ✓
- UWorld Challenge now correctly fails with `uworld_stem_too_short` (134-char NBME stem is valid for NBME, too short for UWorld even in exam mode)

---

## 6. Final Test Results

```
npx vitest run src/lib/questionValidator.test.ts
  Tests: 260 passed (was 225, +35 new, 1 updated)

npx vitest run src/routes/ai.test.ts
  Tests: 46 passed — unchanged

npx tsc --noEmit
  Clean — no errors

npm test (full suite, 18 files)
  Tests: 656 passed (was 621, +35)
```

---

## 7. Remaining Risks

| Risk | Assessment |
|------|-----------|
| `UWORLD_OBJECTIVE_DATA_RE` coverage | The regex covers the most common lab/vital/imaging terms. A vignette using unusual objective findings (e.g., "Wells score", "Trousseau sign") without a lab value could still pass. Risk: low — AI prompts instruct inclusion of objective data. |
| `weak_wrong_option_teaching` is soft-only | AI questions occasionally lack explicit contrast language in wrong-option explanations. These still pass. This is intentional — the AI medical review handles nuanced explanation quality. |
| Option word-count check may reject short valid answers | Single-word options like "Metoprolol" or "Lithium" fail the 3-word rule. UWorld-level questions should use specific multi-word clinical phrases anyway; single-word options signal under-specified distractors. Low risk of false rejection for well-formed questions. |
| Metadata fields not validated | `testedConcept`, `usmleContentArea`, `physicianTask` are enriched client-side after generation. They are not validated by `checkUworldSpecific` because they may be absent at server validation time without indicating a quality failure. Deferred intentionally. |
| `hard_explanation_too_short` overlaps with `shallow_explanation` | Both fire for very short explanations (0–149 chars). This is harmless — both reasons appear in `rejectionReasons`, both are hard rejections, and the AI repair prompt uses the more specific UWorld guidance. |

---

**Phase 4 is complete. No new phases started.**
