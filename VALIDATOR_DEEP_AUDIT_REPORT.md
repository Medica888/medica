# Validator Deep Audit Report

**Date:** 2026-06-04
**Status:** Post-P0 stabilization — 559/559 backend tests passing, typecheck clean
**Scope:** Backend validator architecture + frontend/backend drift

---

## 1. Current Validator Architecture Summary

```
Request
  │
  ▼
generateBatch()  [server/src/routes/ai.ts]
  │
  ├─ normalizeQuestion()          — structural normalization
  │
  ├─ scoreQuestion(q, mode, difficulty)   [questionValidator.ts]
  │   ├─ NBME Difficult ──────────── scoreNbmeQuestion()
  │   │     ├─ nbme_stem_too_short
  │   │     ├─ missing_patient_anchor
  │   │     ├─ weak_clinical_signal
  │   │     ├─ weak_single_best_answer_lead_in
  │   │     ├─ teaching_language_in_stem
  │   │     ├─ scoreNbmeOptionStyle()
  │   │     ├─ scoreNbmeClueLeakage()
  │   │     ├─ scoreExplanationQuality()
  │   │     ├─ checkAnswerSupport()
  │   │     ├─ checkAnswerContradiction()
  │   │     ├─ checkCoachOptionExplanations()
  │   │     └─ validateCardiovascularPathology()  ← specialty gate
  │   │
  │   └─ Balanced / More Hard / More Easy / UWorld Challenge ─ scoreQuestion()
  │         ├─ stem_too_short (< 80 chars)
  │         ├─ scoreNbmeStyle()       (no_clinical_vignette)
  │         ├─ scoreDistractorQuality() (insufficient_options, duplicate_options, generic_option_present)
  │         ├─ scoreClueLeakage()     (severe_clue_leakage)
  │         ├─ scoreExplanationQuality() (shallow_explanation)
  │         ├─ checkAnswerSupport()   (answer_not_supported)
  │         ├─ checkAnswerContradiction() (contradictory_explanation)
  │         ├─ checkCoachOptionExplanations() (missing_option_explanations)
  │         └─ validateCardiovascularPathology()  ← specialty gate
  │
  ├─ scoreScopeAlignment() [NBME+UWorld only] → hard reject if off-scope
  │
  ├─ Phase 2: callMedicalReview() [NBME+UWorld only] → 5-dimension AI review
  │
  └─ Phase 3: attemptRepair() for failers → re-score → optional re-review
```

**Frontend bank validator** (mockQuestions.js — applied to static bank + trusted AI questions):
```
validateHardDifficultyQuestion()    — NBME Difficult + UWorld Challenge bank entries
_validateGeneratedQuestions()       — ALL modes, applied client-side to AI responses
  ├─ _validateStructure()
  ├─ _supportsCorrectAnswer()
  ├─ _contradictsCorrectAnswer()
  └─ _hasCoachOptionExplanations()
```

---

## 2. What Is Now Stable After P0 Fix

| Component | Before P0 Fix | After P0 Fix |
|---|---|---|
| `cardioPathologyValidator` detection | Domain detection too strict; all clinical-vignette Buerger, GCA, PAN, Takayasu, MI, Rheumatic HD questions returned `not_applicable` | Criterion 6 (PATHOLOGY_TASK_RE + CARDIO_SYSTEM_RE in stem) detects all tested concepts without metadata |
| Partial-stem regex patterns | `\bsmok\b`, `\bdiabet\b`, `\bclaudicat\b` etc. failed to match "smoking", "diabetes", "claudication" | Fixed with `\w*\b` suffix; all word families now match |
| `granuloma` wrong-answer gate | `granuloma` with `\b` didn't match "granulomatous"; Buerger wrong-mechanism test returned `warn` not `fail` | `granuloma\w*` correctly catches "granulomatous" |
| `hasCrossConceptAlternative` guard | Alternative concept (atherosclerosis) suppressed `fail` even when Buerger was unambiguously the stem concept | Guard now only applies when `!winner.allRequired`; fully-matched concepts can fail |
| `testedConcept` metadata anchoring | Explicit concept metadata ignored in winner selection | `CONCEPT_META_ALIASES` + `resolveConceptFromMeta` pins the winner when metadata names a known concept |
| Buerger `excludeIfPresent` | Bare `hyperlipidem\w*` fired on "no hyperlipidemia" (negated context) | Removed bare `hyperlipidem\w*`; relies on age 65+ and `type [12] diabet\w*` instead |
| Atherosclerosis `excludeIfPresent` | `[1-2]\d[\s-]*(year|yo)` matched "20-year history" (duration, not age) | Pattern requires `year[\s-]*old` to anchor to patient age |
| CARDIO_SYSTEM_RE partial stems | `myocard` didn't match "myocardium"; `valv` didn't match "valvular" | Fixed with `myocard\w*`, `valv\w*`, `endocard\w*` |
| PATHOLOGY_TASK_RE partial stems | `microscop` didn't match "microscopic"; `histolog` didn't match "histologic"; `patholog` didn't match "pathology" | Fixed with `\w*` suffixes |

---

## 3. Remaining Critical Risks

### C-1: UWorld Challenge uses general `scoreQuestion`, not a UWorld-specific validator
**File:** `server/src/routes/ai.ts:667`, `server/src/lib/questionValidator.ts:649-655`

`isNbmeDifficulty()` returns true only for `'NBME Difficult'`. UWorld Challenge is treated as a general difficulty and goes through `scoreQuestion()` — the same path as Balanced and More Hard. The UWorld-specific rules (`stemMin=180`, `explanationMin=350`, `minReasoningTerms=6`, per-option explanation depth ≥60 chars, ≥2 wrong-option contrasts) are **frontend-only** in `mockQuestions.js:HARD_DIFFICULTY_RULES['UWorld Challenge']`. The backend never enforces them during AI generation.

**Why it matters:** AI-generated UWorld Challenge questions pass backend validation with 100-char stems and 150-char explanations that would fail the frontend bank validator. Medical review provides a partial safeguard, but it evaluates subjective quality, not structural thresholds.

**Suggested fix:** Add `'UWorld Challenge'` to the conditions that route to a hard-mode scorer, or add a `scoreUWorldQuestion()` function that enforces UWorld-specific structural thresholds before medical review. Safe to implement — only affects UWorld Challenge generation; adds rejects, not false passes.

**Behavior change:** Yes — some currently passing UWorld questions would be rejected at the rule-based gate before medical review.

---

### C-2: Scope validation is NBME/UWorld-only; scoped Balanced generation is not validated
**File:** `server/src/routes/ai.ts:681-697`

`requestedScopeForCheck` is only defined when `needsReview = true` (NBME Difficult or UWorld Challenge). For Balanced, More Hard, or More Easy with a specific topic/system selected, `scoreScopeAlignment()` is **never called**. Questions about the wrong system/subject pass validation silently.

**Why it matters:** A user requesting "Cardiovascular / Pharmacology" in Balanced mode can receive physiology questions about the renal system. The frontend `inScope()` filter provides a second line of defense, but it uses a different (and weaker) substring-match logic.

**Suggested fix:** Call `scoreScopeAlignment()` for all specific scopes regardless of difficulty, but log the mismatch rather than hard-rejecting for non-hard-mode (where scope mismatches are less harmful). Consider making it a hard gate only for specific-topic scopes in all modes. Safe change — no behavior change for hard modes.

**Behavior change:** Yes for Balanced/More Hard — currently unseen scope mismatches would appear in telemetry.

---

### C-3: Static bank questions are never server-side quarantined
**File:** `server/src/routes/ai.ts:1073-1091`, `medica-app/src/lib/storage.js:157-177`

The backend quarantine filter (`getQuarantinedFingerprints()`) only runs against AI-generated questions returned in the current batch. Static bank questions in `questionBanks/` are served directly by the frontend via `getBankQuestionsForConfig()` and are only filtered by `filterReportedQuestions()` from localStorage — a per-device, per-user filter. Multiple users reporting the same wrong static bank question get no cross-user protection.

**Why it matters:** A factually incorrect question in `nbmeQuestions.js` can be reported by 50 users and will still appear for any user on a new device or cleared storage. The quarantine system (2+ wrong_answer reports → quarantine) only works for AI-generated questions that have been quarantined in the database.

**Suggested fix:** Add a backend endpoint that returns quarantined fingerprints for static bank questions too, or flag static bank questions with known-bad fingerprints in the database when they're reported. This requires a small schema addition but no architectural change.

**Behavior change:** Yes — correctly flagged static bank questions would be hidden until reviewed.

---

## 4. High-Risk Validator Gaps

### H-1: Only one specialty validator exists (cardiovascular pathology)
**File:** `server/src/lib/cardioPathologyValidator.ts`

The specialty validator system supports exactly one discipline: cardiovascular pathology, covering 10 concepts. Questions about renal pathology (podocyte effacement, crescentic GN), cardiac pharmacology (mechanism errors in β-blocker questions), neurology (wrong reflex arc), pharmacokinetics (wrong elimination pathway), or renal physiology can contain factually wrong correct answers and will pass all rule-based gates. Medical review provides an AI-level catch for NBME/UWorld questions only.

**Why it matters:** The specialty validator is the only mechanism that catches wrong-mechanism answers deterministically. Without coverage for other domains, questions like "ACE inhibitors cause hyperkalemia through inhibition of bradykinin" (wrong mechanism — it's angiotensin II) pass undetected for Balanced mode.

**Suggested fix:** Build additional concept packs. Highest-value next domains (by bank density and failure mode diversity): renal pathology, cardiac pharmacology, renal physiology. Architecture already supports additive validators — the integration hook in `scoreQuestion()` just needs to call additional `validateX()` functions.

**Behavior change:** Additive only — new validators add rejections, never change existing pass/fail for questions outside their domain.

---

### H-2: `callMedicalReview` silently treats all exceptions as `pass: false`
**File:** `server/src/routes/ai.ts:580-602`

The catch block in `callMedicalReview()` returns `{ pass: false, result: null, failedCategories: [] }`. A transient Anthropic API error (ECONNRESET, 429 after retry exhaustion, timeout) causes a permanent silent rejection of a structurally valid question. There is no distinction between "AI reviewer said fail" and "AI reviewer call crashed". The telemetry field `medicalReviewRejected` increments in both cases.

**Why it matters:** Under load spikes or transient API instability, the NBME/UWorld generation loop silently discards batches. The `stoppedReason` telemetry field records `generation_error` when `callMedicalReview` throws, but individual question rejections from review exceptions are indistinguishable from genuine review failures in `medicalReviewRejected` counts.

**Suggested fix:** Distinguish exception vs reviewer-reject in telemetry: add a `medicalReviewErrored` count. Optionally implement a fallback: if review throws (not returns fail), skip review rather than reject — review-skip telemetry already exists (`medicalReviewSkipped`). This changes yield behavior under API failure.

**Behavior change:** Under normal conditions: no change. Under API errors: potentially allows more questions through on exception vs current silent reject.

---

### H-3: Repair prompt leaks the full question payload but not the metadata that caused rejection
**File:** `server/src/lib/questionValidator.ts:937-964`

`buildRepairPrompt()` includes `stem`, `options`, `correct`, `explanation`, and optionally `optionExplanations`. It includes `testedConcept` and `topic`. It does NOT include `subject`, `system`, `difficulty`, or `mode`. The repair AI has no context about what difficulty standard the question must meet or what system is being tested. The repair model is `claude-haiku-4-5-20251001` — the same model that generated the flawed question.

**Why it matters:** Repairs for `shallow_explanation` in a UWorld Challenge question get no signal about UWorld depth requirements. The repaired question passes `scoreQuestion()` for NBME/UWorld only if it crosses the general thresholds (explanation ≥150 chars), not the UWorld-specific ones. Haiku repairing its own haiku output is a low-quality loop.

**Suggested fix:** Pass `difficulty` and `mode` in the repair payload. Pass rejection-specific context (e.g. "this is a UWorld Challenge question; explanation must be ≥350 characters, include mechanism and distractor reasoning"). Consider using Sonnet for repairs (or only attempting repair when the cost is justified by difficulty level). Safe change — only affects repair quality.

**Behavior change:** Behavior change only in repair quality, not in gate logic.

---

### H-4: `MEDICAL_ABBREVIATIONS` set has minor drift between frontend and backend
**Files:** `server/src/lib/questionValidator.ts:142-167`, `medica-app/src/lib/ai/generateAIQuestions.js:312-326`

Both files carry a manually maintained `MEDICAL_ABBREVIATIONS` set. They diverge: the frontend is missing `ADH` (backend has it both under "Kidney / renal" and "Endocrine hormones"), and the frontend has a minor structural difference in the list construction. More entries may have been added to one but not the other.

**Why it matters:** A question with `correct: 'ADH'` passes `checkAnswerSupport()` on the backend but may fail `_supportsCorrectAnswer()` on the frontend re-validation of trusted questions. This could cause a backend-generated trusted question to be silently purged by `purgeStaleQuestionsFromTrusted()` on the next frontend load.

**Suggested fix:** Extract the set to a shared JSON or constant file that both sides import. Since the project is a monorepo, a shared constants file in `medica-app/src/lib/` works without cross-package imports.

**Behavior change:** Behavioral fix — aligns the two validators so trusted questions don't get incorrectly purged.

---

## 5. Medium-Risk Validator Gaps

### M-1: Fingerprint computation is duplicated with different normalization
**Files:** `server/src/routes/ai.ts:260-264` (`computeQuestionFingerprint`), `medica-app/src/lib/questionDedup.js` (`getQuestionFingerprint`)

The backend fingerprint is `normStem(120 chars) || normConcept`. The frontend fingerprint (in `questionDedup.js`) may use different truncation or field priority. If they produce different fingerprints for the same question, the quarantine check in the backend won't match the report fingerprint stored from the frontend.

**Why it matters:** Report fingerprints are stored by the backend when a report comes in via the `/report` route. If the frontend computed a different fingerprint when the question was played, the backend-stored fingerprint won't match what the quarantine check filters.

**Suggested fix:** Align the fingerprint algorithm. Document the canonical format in one place. Test that a round-trip (frontend generates → backend stores → frontend reports → backend quarantines → backend filter) uses the same fingerprint at each step.

**Behavior change:** Correctness fix — reports may currently fail to quarantine due to fingerprint mismatch.

---

### M-2: `scoreScopeAlignment` is a soft check with no test coverage for the actual route integration
**Files:** `server/src/routes/ai.ts:681-697`, `server/src/lib/questionValidator.test.ts:1742-1860`

`scoreScopeAlignment()` is well-tested in isolation (unit tests). The route integration — `requestedScopeForCheck` construction, the `continue` that hard-rejects, and the `scopeRejected` telemetry increment — has zero test coverage. The 41 tests in `ai.test.ts` cover `runAdaptiveRefill` and medical review telemetry but not the scope-reject path in `generateBatch`.

**Why it matters:** A regression in scope check wiring (e.g. `requestedScopeForCheck` accidentally set to undefined) would silently disable scope validation for all hard-mode generation, with no test catching it.

**Suggested fix:** Add a route-level integration test that injects a mock `generateBatch` with a deliberately off-scope question and asserts `scopeRejected === 1` and the question does not appear in results.

---

### M-3: UWorld Challenge `scoreQuestion` path allows `shallow_explanation` as a hard rejection but no UWorld-specific depth checks
**Files:** `server/src/lib/questionValidator.ts:65-80`, `medica-app/src/lib/mockQuestions.js:67-90`

For UWorld Challenge, the backend `HARD_REJECTIONS` set includes `shallow_explanation` (explanation < 150 chars). But UWorld-specific depth requirements in the frontend validator require `explanationMin: 350`, `minReasoningTerms: 6`, `minClinicalSignals: 3`, and `minWrongOptionContrasts: 2` in wrong-option explanations. A 151-character explanation passes the backend but fails the frontend bank validator.

**Why it matters:** AI-generated UWorld questions trusted to storage (`appendTrustedGeneratedQuestions`) pass the backend validator at 151-char explanation depth, are stored as trusted, but are then re-validated by `_validateGeneratedQuestions()` on next load using `_getQuestionRejectionReasons()` — which for UWorld trusted reuse does NOT apply the hard UWorld rules, only the general rules. So the question survives trusted storage but is weaker than a bank UWorld question.

**Suggested fix:** Apply UWorld structural rules at the point of AI validation on the backend (see C-1). This consolidates the rule definition to one canonical source.

---

### M-4: Medical review uses `claude-haiku-4-5-20251001` for 5-dimension expert review
**File:** `server/src/routes/ai.ts:586`

`callMedicalReview` defaults to `AI_MEDICAL_REVIEW_MODEL || AI_MODEL || 'claude-haiku-4-5-20251001'`. Haiku is a fast, economical model but has lower reliability on nuanced medical accuracy tasks (distinguishing "medically correct but not the best answer" from "medically wrong"). For NBME Difficult and UWorld Challenge, where question accuracy is the primary quality bar, a stronger model (Sonnet) would produce more reliable review decisions.

**Why it matters:** Medical review false-passes (passes a factually wrong question) are silent quality failures. Medical review false-rejects (rejects a good question) waste candidates and increase refill rounds. Both harm the UX for hard-mode users.

**Suggested fix:** Use `claude-sonnet-4-6` for `AI_MEDICAL_REVIEW_MODEL`, or add explicit model routing so NBME/UWorld reviews use Sonnet. Document this in `.env.example`.

---

### M-5: `NBME_HARD_REJECTIONS` excludes `shallow_explanation` but it can still cause a fail via `qualityScore < 60`
**Files:** `server/src/lib/questionValidator.ts:84-100`, `server/src/lib/questionValidator.ts:486-488`

`scoreNbmeQuestion()` computes `validationStatus` as `hasHardRejection ? 'fail' : 'pass'`. `shallow_explanation` is intentionally excluded from `NBME_HARD_REJECTIONS`. However, the NBME path also computes `qualityScore` and... does **not** use it for gating. The `validationStatus` is rule-based only. This is correct behavior, but the comment `// Pass/fail is rule-based only — qualityScore is telemetry` makes this explicit. The risk is that future maintainers add `qualityScore >= 60` to the NBME path by analogy with the general path.

The general path DOES gate on `qualityScore >= 60 && !hasHardRejection`. For UWorld Challenge going through the general path, a question with a very low qualityScore but no hard rejections would still pass. This is a minor correctness gap.

**Suggested fix:** Document explicitly in the code why NBME uses rule-only gating and the general path uses both. Add a test that asserts NBME Difficult passes with a 0 qualityScore as long as no hard rejections occur.

---

### M-6: `validationStatus: 'repaired'` is set but never tested in isolation
**File:** `server/src/routes/ai.ts:749`

When a repaired question passes validation, it's given `validationStatus: 'repaired'`. The client receives this and stores it in the question object. No test verifies this field is set, nor does any frontend code handle `'repaired'` differently from `'pass'`. The type union in `QuestionQuality` includes `'repaired'` as a valid value, but the `HARD_REJECTIONS`/`NBME_HARD_REJECTIONS` sets only check against `rejectionReasons`, so a repaired question with the same rejection reasons would be re-rejected in any subsequent re-validation.

**Why it matters:** If a repaired question is saved to trusted storage and re-validated on next load, the `'repaired'` status is lost since `scoreQuestion` returns `'pass'` or `'fail'`, never `'repaired'`. This is fine in practice but the status is misleading.

**Suggested fix:** Minor: Remove `'repaired'` from the `QuestionQuality` type and use a separate field (e.g. `wasRepaired: boolean`) so the interface is cleaner.

---

## 6. Frontend / Backend Drift Matrix

| Rule | Frontend (`generateAIQuestions.js`) | Backend (`questionValidator.ts`) | Drift |
|---|---|---|---|
| missing_stem | `_validateStructure` → `missing_stem` | `stem.length < 80` → `stem_too_short` | Different names, similar intent |
| invalid_correct_answer | `_validateStructure` → `invalid_correct_answer` | `invalid_correct_letter` | Different names, same logic |
| invalid_options | `_validateStructure` → `invalid_options` | `insufficient_options`, `duplicate_options` | Different names, mostly aligned |
| answer_not_supported | `_supportsCorrectAnswer()` | `checkAnswerSupport()` | **Aligned** — both ported from same spec |
| contradictory_explanation | `_contradictsCorrectAnswer()` | `checkAnswerContradiction()` | **Aligned** — same patterns |
| missing_option_explanations | `_hasCoachOptionExplanations()` | `checkCoachOptionExplanations()` | **Aligned** |
| MEDICAL_ABBREVIATIONS bypass | Frontend set (27 entries, no ADH) | Backend set (28 entries, has ADH) | **Drift** — missing `ADH` in frontend |
| shallow_explanation | Not enforced generally (only in hard bank) | Hard rejection for non-NBME modes | **Partial drift** |
| nbme_stem_too_short | `validateNbmeDifficultyQuestion` ≥70 | `scoreNbmeQuestion` ≥70 | **Aligned** |
| missing_patient_anchor | `NBME_PATIENT_ANCHOR_RE` | `NBME_PATIENT_ANCHOR_RE` (same regex) | **Aligned** |
| weak_clinical_signal | Frontend uses `_clinicalSignalCount === 0` | Backend: same logic | **Aligned** |
| teaching_language_in_stem | `NBME_TEACHING_STEM_RE` | Same regex | **Aligned** |
| clue_leakage | `_hasNbmeClueLeakage` | `scoreNbmeClueLeakage` | **Aligned** (same normalization) |
| hard UWorld stem rules | `stemMin: 180`, `OBJECTIVE_DATA_RE`, `minClinicalSignals: 3` | **Not implemented in backend** | **CRITICAL DRIFT** |
| hard UWorld explanation depth | `explanationMin: 350`, `minReasoningTerms: 6` | **Not implemented** | **CRITICAL DRIFT** |
| hard UWorld option quality | `minOptionLength: 12`, `minOptionWordCount: 3` | **Not implemented** | **HIGH DRIFT** |
| UWorld option explanation depth | `minUworldOptionExplanationLength: 60` | **Not implemented** | **HIGH DRIFT** |
| wrong_option_contrast | `minWrongOptionContrasts: 2` | **Not implemented** | **HIGH DRIFT** |
| missing_tested_concept | `_validateHardQuestionMetadata` | **Not implemented** | **HIGH DRIFT** |
| missing_question_angle | `_validateHardQuestionMetadata` | **Not implemented** | **HIGH DRIFT** |
| missing_usmle_content_area | `_validateHardQuestionMetadata` | **Not implemented** | **HIGH DRIFT** |
| missing_physician_task | `_validateHardQuestionMetadata` | **Not implemented** | **HIGH DRIFT** |
| non_official_usmle_content_area | `_validateHardQuestionMetadata` | **Not implemented** | **MEDIUM DRIFT** |
| non_official_physician_task | `_validateHardQuestionMetadata` | **Not implemented** | **MEDIUM DRIFT** |
| non_concise_nbme_options | option.length > 160 | Not implemented | **LOW DRIFT** |
| duplicated_hard_options | `_hasDuplicateOptionMeaning()` normalized | `duplicate_options` exact text | **Partial drift** — normalized vs exact |
| specialty validator (cardio) | **Not implemented** | `validateCardiovascularPathology()` | **Backend-only** (correct — complex) |
| scope alignment | `inScope()` soft filter | `scoreScopeAlignment()` hard gate (NBME/UWorld only) | **Intentional** |

**Recommendation:** The frontend should be the thin client for structural checks only. All hard-rejection rules should live in the backend validator and be authoritative. The frontend `_validateGeneratedQuestions()` is a useful secondary filter for trusted question re-validation but should not diverge from backend logic.

---

## 7. NBME Validation Matrix

| Rule | Implemented | Gate Type | Notes |
|---|---|---|---|
| Stem ≥70 chars | ✅ `nbme_stem_too_short` | Hard | Frontend-aligned |
| Patient anchor | ✅ `missing_patient_anchor` | Hard | Both sides aligned |
| Clinical signal | ✅ `weak_clinical_signal` | Hard | Both sides aligned |
| NBME lead-in + `?` | ✅ `weak_single_best_answer_lead_in` | Hard | Both sides aligned |
| No teaching language | ✅ `teaching_language_in_stem` | Hard | Both sides aligned |
| 4 options, no generic | ✅ `weak_distractors` | Hard | Options ≥4 chars |
| Clue leakage | ✅ `clue_leakage` | Hard | Normalized comparison |
| Answer support | ✅ `answer_not_supported` | Hard | Via semantic check |
| Contradiction | ✅ `contradictory_explanation` | Hard | Via semantic check |
| Coach explanations | ✅ `missing_option_explanations` | Hard | Mode-gated |
| Specialty validation | ✅ `specialty_validation_failed` | Hard | Cardio-path only |
| AI medical review | ✅ All 5 dimensions | Hard | External AI gate |
| Scope alignment | ✅ `off_scope_*` | Hard | NBME Difficult only |
| Metadata completeness | ❌ `missing_tested_concept` etc. | Missing | Frontend-only |
| Valid USMLE taxonomy | ❌ `non_official_usmle_content_area` | Missing | Frontend-only |
| Option text length > 160 | ❌ `non_concise_nbme_options` | Missing | Frontend-only |
| Objective data in stem | ❌ | Missing | Not checked on backend |

**Gap summary:** NBME validation is mostly solid on the backend. The missing checks (`missing_tested_concept`, USMLE taxonomy validation) are cosmetic — they affect metadata quality but not clinical correctness. The AI medical review provides the strongest safety net for NBME clinical accuracy.

---

## 8. UWorld Validation Matrix

| Rule | Implemented | Gate Type | Notes |
|---|---|---|---|
| Stem ≥80 chars (general) | ✅ | Hard (general path) | UWorld goes through general scoreQuestion |
| Clinical vignette | ✅ `no_clinical_vignette` | Hard | Age/sex/presentation check |
| No generic options | ✅ `generic_option_present` | Hard | |
| Clue leakage | ✅ `severe_clue_leakage` | Hard | |
| Explanation ≥150 chars | ✅ `shallow_explanation` | Hard | UWorld needs ≥350 |
| Answer support | ✅ | Hard | |
| Contradiction | ✅ | Hard | |
| Specialty validation | ✅ | Hard | Cardio-path only |
| AI medical review | ✅ | Hard | |
| Scope alignment | ✅ | Hard | |
| Stem ≥180 chars | ❌ | **MISSING** | Frontend requires 180 |
| Objective data in stem | ❌ `missing_objective_data` | **MISSING** | Frontend checks |
| ≥3 clinical signals | ❌ | **MISSING** | Frontend requires 3 |
| ≥6 reasoning terms | ❌ | **MISSING** | Frontend requires 6 |
| Explanation ≥350 chars | ❌ | **MISSING** | Frontend requires 350 |
| Option length ≥12 chars | ❌ | **MISSING** | Frontend requires 12 |
| Option word count ≥3 | ❌ | **MISSING** | Frontend requires 3 |
| Option explanation depth ≥60 | ❌ | **MISSING** | Frontend requires 60 |
| ≥2 wrong-option contrasts | ❌ | **MISSING** | Frontend requires 2 |
| Metadata completeness | ❌ | **MISSING** | Frontend only |

**Gap summary:** UWorld Challenge has the most significant drift. 9 of 18 structural rules are missing on the backend. The AI medical review compensates partially, but structural checks are faster, cheaper, and more predictable than AI review. These missing rules should be the top implementation priority after C-1 is addressed.

---

## 9. Specialty Validator Scalability Matrix

| Domain | Status | Concepts Covered | Notes |
|---|---|---|---|
| Cardiovascular pathology | ✅ Implemented | 10 (Buerger, GCA, Takayasu, PAN, Kawasaki, Atherosclerosis, Malignant HTN, Aortic dissection, MI timeline, Rheumatic HD) | Post-P0 fix: stable and tested |
| Cardiovascular physiology | ❌ Not implemented | 0 | High-value: Frank-Starling, Starling forces, pressure-volume loops — often tested with wrong-direction changes |
| Cardiac pharmacology | ❌ Not implemented | 0 | β-blockers, calcium channel blockers, antiarrhythmics — mechanism errors common in AI output |
| Renal pathology | ❌ Not implemented | 0 | Glomerulopathies, tubular disorders — complex with similar presentations |
| Renal physiology | ❌ Not implemented | 0 | Tubular handling, acid-base — directional errors common |
| Pulmonary pathology | ❌ Not implemented | 0 | |
| Pharmacokinetics | ❌ Not implemented | 0 | First-pass, volume of distribution, half-life calculations — numeric errors |
| Neurology | ❌ Not implemented | 0 | Nerve injury localisation, UMN vs LMN — high error rate in AI |
| Biochemistry pathways | ❌ Not implemented | 0 | Enzyme deficiencies, pathway direction |
| Microbiology | ❌ Not implemented | 0 | Mechanism of antibiotic action |

**Architecture scalability assessment:**

The current architecture supports additional validators via the integration hook in `scoreQuestion()` (line 696) and `scoreNbmeQuestion()` (line 481). Adding a new specialty validator requires:
1. A new `.ts` file with the validator function
2. Importing and calling it alongside `validateCardiovascularPathology()`
3. Tests for the new validator

The current approach of parallel concept rules (one `ConceptRule[]` per domain) scales well to ~5–8 domains. Beyond that, the flat concept-rule list will need grouping by domain to maintain readability.

**Risk of scaling:** The `CONCEPT_META_ALIASES` array in `cardioPathologyValidator.ts` will need to be extended per domain, or refactored into a registry pattern as the number of domains grows. Currently no registry exists — each domain would need its own alias map.

**Recommendation:** Before adding the 3rd specialty validator, extract the alias-map + `resolveConceptFromMeta` pattern into a shared `SpecialtyValidatorRegistry` that all validators register into. This prevents per-domain duplication.

---

## 10. Risk Matrix

| Severity | ID | File | Problem | Why It Matters | Suggested Fix | Safe? | Behavior Change? |
|---|---|---|---|---|---|---|---|
| **Critical** | C-1 | `routes/ai.ts`, `questionValidator.ts` | UWorld Challenge uses general `scoreQuestion`, missing 9 structural rules | AI-generated UWorld questions can be thin-stemmed with short explanations; frontend bank rules don't apply to generated content | Add `scoreUWorldQuestion()` or route UWorld to hard-mode scorer | Yes | Yes — more rejects |
| **Critical** | C-2 | `routes/ai.ts` | Scope validation is NBME/UWorld-only; scoped Balanced generation unvalidated | Off-topic questions served silently for any non-hard-mode scoped config | Call `scoreScopeAlignment()` for all specific scopes, log for soft modes | Yes | Yes — new telemetry |
| **Critical** | C-3 | `routes/ai.ts`, `storage.js` | Static bank questions not server-side quarantined | Reported incorrect bank questions appear for all users indefinitely | Backend fingerprint endpoint or DB flag for quarantined bank questions | Yes | Yes — hides bad bank Qs |
| **High** | H-1 | `cardioPathologyValidator.ts` | Only 1 of 10 specialty domains validated | Wrong-mechanism answers in renal, pharma, neuro, etc. pass undetected for Balanced | Add renal pathology, cardiac pharmacology validators | Yes | Additive only |
| **High** | H-2 | `routes/ai.ts:580-602` | Medical review exceptions silently reject questions | Transient API failures cause silent yield drop with no operator alert | Add `medicalReviewErrored` telemetry; optionally treat exception as skip | Yes | Varies by choice |
| **High** | H-3 | `questionValidator.ts:937-964` | Repair prompt lacks difficulty/mode context | Haiku repairs UWorld questions with no UWorld depth guidance; repairs barely clear 150-char threshold | Pass difficulty, mode to repair prompt; use Sonnet for hard repairs | Yes | Repair quality only |
| **High** | H-4 | Both files | `MEDICAL_ABBREVIATIONS` drift (ADH missing in frontend) | ADH-answer trusted questions may be purged by frontend re-validation | Shared constant file | Yes | Correctness fix |
| **Medium** | M-1 | Both files | Fingerprint computation duplicated; potential divergence | Quarantine by fingerprint may silently fail | Align + document canonical fingerprint format | Yes | Correctness fix |
| **Medium** | M-2 | `routes/ai.test.ts` | Scope rejection path in `generateBatch` has no test | Regression in scope-check wiring would go undetected | Add route-level integration test for scope rejection | Yes | No behavior change |
| **Medium** | M-3 | `questionValidator.ts`, `mockQuestions.js` | UWorld explanation threshold: 150 (backend) vs 350 (frontend) | AI UWorld questions with 151-char explanations pass backend, would fail frontend bank check | Align thresholds (see C-1) | Yes | More rejects |
| **Medium** | M-4 | `routes/ai.ts:586` | Medical review uses Haiku by default | Lower accuracy on nuanced medical correctness tasks | Set `AI_MEDICAL_REVIEW_MODEL=claude-sonnet-4-6` as default | Yes | Yield + cost change |
| **Medium** | M-5 | `questionValidator.ts:486-488` | NBME `qualityScore` computed but never gates | Future maintainer may incorrectly add score gating | Document explicitly; add a test that asserts rule-only gating | Yes | No behavior change |
| **Medium** | M-6 | `routes/ai.ts:749` | `validationStatus: 'repaired'` not testable in isolation | Status is set but no test covers it; lost on re-validation | Replace with `wasRepaired: boolean` field | Yes | Interface cleanup |
| **Low** | L-1 | `mockQuestions.js:99` | Frontend NBME `options.length !== 4 && !== 5 && !== 6` allows 5–6 options | Backend requires exactly 4; bank can have questions that would fail backend validation | Align frontend to require exactly 4 | Yes | Frontend bank filter |
| **Low** | L-2 | `questionValidator.ts` | `isSuspectStem` list is hardcoded and incomplete | "A man with" passes but is equivalent to rejected "a man presents" | Add `a woman with`, `a child with` etc. | Yes | Additive only |
| **Low** | L-3 | `cardioPathologyValidator.ts` | `CONCEPT_META_ALIASES` will need manual extension per new domain | No registry pattern; adding domain 3+ requires touching this file | Extract registry to shared pattern | Yes | Architecture only |

---

## 11. Recommended Next Implementation Order

**Priority 1 — Close the UWorld gap (C-1 + M-3)**
Add `scoreUWorldQuestion()` implementing the 9 missing structural rules. Wire it so `UWorld Challenge` routes to it before medical review. This removes the most significant correctness gap for the product's premium tier.

**Priority 2 — Scope validation for all modes (C-2)**
Extend `requestedScopeForCheck` construction to cover all specific-scope configs, not just `needsReview`. Soft-log for non-hard modes; hard-reject for specific topic/clinicalFocus in all modes. Low risk, high correctness benefit.

**Priority 3 — Align MEDICAL_ABBREVIATIONS (H-4)**
Quick win. Extract to shared constant. Prevents trusted-question purge bugs.

**Priority 4 — Medical review error telemetry (H-2)**
Add `medicalReviewErrored` count distinct from `medicalReviewRejected`. No behavior change; surfaces hidden API failures.

**Priority 5 — Second specialty validator (H-1)**
Implement `cardiacPharmacologyValidator.ts` covering β-blockers, Ca-channel blockers, antiarrhythmics — the highest AI error rate for mechanism questions in the cardiovascular system. Follow established pattern.

**Priority 6 — Repair prompt improvement (H-3)**
Pass `difficulty` and `mode` in repair context. Consider Sonnet for UWorld repairs. Low implementation cost, noticeable quality improvement for hard-mode refills.

**Priority 7 — Fingerprint alignment (M-1)**
Audit the round-trip. If divergence is confirmed, align and add a cross-layer test.

**Priority 8 — Static bank quarantine (C-3)**
Requires a backend API change: endpoint returning quarantined bank fingerprints, or a DB flag. Design decision needed on whether to auto-quarantine or require manual review.

**Priority 9 — Specialty validator registry (L-3)**
Before adding the 3rd+ specialty domain, refactor to a registry pattern to prevent per-validator duplication of alias maps and integration hooks.

---

*Report generated from code audit. No changes were made to any file.*
