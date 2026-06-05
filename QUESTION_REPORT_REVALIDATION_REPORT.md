# Question Report Reason Expansion + Revalidation Queue — Phase 6.1

**Date:** 2026-06-05
**Status:** COMPLETE

---

## 1. New Report Reason Added

**Value:** `ambiguous_or_insufficient_clues`
**User-facing label:** `Ambiguous / insufficient clinical clues`

**Meaning:** A student uses this reason when the question stem lacks enough information to identify a single defensible correct answer — the clinical scenario is under-specified, a key discriminating finding is missing, the lead-in is unclear, or multiple answers are plausible given the information provided.

This captures a failure mode distinct from the existing three reasons:
- `wrong_answer` — the marked answer is factually incorrect
- `bad_explanation` — the explanation is wrong, missing, or contradicts the answer
- `off_topic` — the question's subject/system doesn't match what was requested
- `ambiguous_or_insufficient_clues` — **new** — the question itself is structurally under-specified

---

## 2. Why It Matters

Ambiguous questions are a common quality failure in AI-generated content. The AI may generate a question where the correct answer requires clinical data that is not included in the stem (e.g., a BP value, a lab result, or a timeline that would distinguish between two competing diagnoses). Students who report these questions provide a direct signal that validator rules like `missing_objective_data`, `weak_clinical_signal`, or `insufficient_reasoning_depth` may have been too permissive.

Collecting these reports:
- Feeds the backend quarantine system (existing total >= 5 threshold applies)
- Triggers a `watch + revalidate_clues` status at 2+ reports (before quarantine)
- Identifies which validator rules need tightening for specific difficulty tiers
- Does NOT automatically delete questions — questions enter review, not immediate quarantine

---

## 3. Files Changed

### Backend (server/)

| File | Change |
|------|--------|
| `migrations/1748400000001_add-ambiguous-report-reason.js` | **New** — drops old CHECK constraint, adds 4-value constraint |
| `src/schemas/questionReport.ts` | Added `ambiguous_or_insufficient_clues` to Zod enum |
| `src/types/index.ts` | Updated `QuestionReportReason`, `QuestionRecommendedAction`, `FingerprintCountRow`, `QuestionFingerprintReport`, `QuestionReportSummaryEntry`, `QuestionReportSummary`, `QuestionReport.reason` |
| `src/services/QuestionReportService.ts` | Added `WATCH_AMBIGUOUS_MIN = 2` threshold, `revalidate_clues` action, `computePrimaryReason` updated for 4 reasons, exported `REPORT_REASON_REVALIDATION_MAP` |
| `src/repositories/interfaces.ts` | Added `globalAmbiguous` to `getCountsByFingerprint` return type |
| `src/repositories/memory/QuestionReportsRepository.ts` | Added ambiguous count to all aggregation methods |
| `src/repositories/pg/QuestionReportsRepository.ts` | Added `COUNT(*) FILTER (WHERE reason = 'ambiguous_or_insufficient_clues')` to all SQL queries |
| `src/routes/questionReports.test.ts` | Added 14 new tests (see section 5) |

### Frontend (medica-app/)

| File | Change |
|------|--------|
| `src/components/coach/CoachQuestion.jsx` | Added `<option value="ambiguous_or_insufficient_clues">` |
| `src/components/practice/PracticeQuestion.jsx` | Added `<option value="ambiguous_or_insufficient_clues">` |
| `src/components/session/QuizSession.jsx` | Added `<option value="ambiguous_or_insufficient_clues">` |
| `src/lib/storage.test.js` | Added 4 new tests (see section 5) |

---

## 4. Revalidation Matrix by Report Reason

The `REPORT_REASON_REVALIDATION_MAP` constant (exported from `QuestionReportService.ts`) maps each reason to the validator checks most relevant for re-evaluation:

| Report Reason | Revalidation Focus | Key Validator |
|--------------|-------------------|---------------|
| `wrong_answer` | Answer correctness, explanation alignment | `checkAnswerSupport`, `checkAnswerContradiction` |
| `bad_explanation` | Explanation quality and depth | `scoreExplanationQuality`, `checkAnswerSupport` |
| `off_topic` | Scope/subject/system alignment | `scoreScopeAlignment` |
| `ambiguous_or_insufficient_clues` | Clinical data sufficiency, question clarity, structural quality | `scoreNbmeClinicalSignal`, `UWORLD_OBJECTIVE_DATA_RE`, lead-in check, `checkDifficultyFit`, `checkAnswerSupport`, `scoreNbmeOptionStyle`/`checkUworldSpecific` |

### Threshold Behavior

| Threshold | Status | Action |
|-----------|--------|--------|
| `wrong_answer >= 2` | `quarantined` | `quarantine` |
| `off_topic >= 3` | `quarantined` | `quarantine` |
| `total >= 5` (any reason) | `quarantined` | `quarantine` |
| `bad_explanation >= 3` | `watch` | `repair_explanation` |
| **`ambiguous_or_insufficient_clues >= 2`** | `watch` | `revalidate_clues` ← **new** |
| `total >= 2` | `watch` | `review` |

---

## 5. Tests Added (18 total)

### Backend — `questionReports.test.ts` (14 tests)

**Route tests:**
- Accepts `ambiguous_or_insufficient_clues` reason and returns 201
- Stores the reason correctly in the repository

**Service threshold tests:**
- 1 ambiguous report → `clear`
- 2 ambiguous reports → `watch` + `revalidate_clues`
- 5 ambiguous reports → `quarantined` (total >= 5)
- Ambiguous count appears in `getFingerprintReport.byReason`
- Ambiguous count appears in `getSummary.byReason`
- Ambiguous count appears in `topFingerprints.ambiguousReports`
- 2 ambiguous reports → `watch`, not `quarantined` (separate from wrong_answer threshold)
- Existing `wrong_answer >= 2` quarantine threshold unchanged

**Revalidation map tests:**
- All four reasons have an entry in `REPORT_REASON_REVALIDATION_MAP`
- `ambiguous_or_insufficient_clues` maps to clinical + structural checks
- `wrong_answer` maps to answer correctness checks
- `off_topic` maps to scope alignment

**Existing tests updated:**
- "accepts all three valid reasons" → "accepts all four valid reasons"

### Frontend — `storage.test.js` (4 tests)

- Saves with the new reason to localStorage
- `filterReportedQuestions` hides a question reported as ambiguous
- Existing reasons still work alongside new reason
- Backend POST is sent with the new reason correctly

---

## 6. Final Test Results

```
Backend:
  npx vitest run src/routes/questionReports.test.ts  →  45 passed  (was 29, +14 updated/new, 1 updated)
  npx vitest run src/routes/ai.test.ts               →  59 passed  — unchanged
  npx tsc --noEmit                                   →  clean
  npm test (full backend)                            →  692 passed (was 678, +14)

Frontend:
  npx vitest run src/lib/storage.test.js             →  25 passed  (was 21, +4)
  npm test (full frontend)                           →  404 passed (was 400, +4)
```

---

## 7. Remaining Risks

| Risk | Assessment |
|------|-----------|
| DB migration required in production | The CHECK constraint `qr_reason_check` must be updated via `npm run migrate` before deploying. Existing rows are unaffected (they use old valid reasons). |
| No automatic revalidation pipeline yet | `REPORT_REASON_REVALIDATION_MAP` defines what to re-check but there is no background job that runs these checks on flagged questions. This is intentional — manual review is the gate. |
| `ambiguous` reports count toward `total >= 5` quarantine | A question with 5 ambiguous-only reports will be quarantined. This is the correct behavior — sustained ambiguity signals a structural failure worth blocking. |
| UI option label truncation on small screens | The label "Ambiguous / insufficient clinical clues" is 43 chars, longer than existing options. Acceptable given existing select width, but worth monitoring on mobile. |

---

**Phase 6.1 is complete. No new phases started.**
