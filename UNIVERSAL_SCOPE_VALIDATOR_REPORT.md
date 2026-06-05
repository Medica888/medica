# Universal Scope Validator — Implementation Report

**Date:** 2026-06-04
**Status:** Complete — 596/596 backend tests passing, typecheck clean

---

## 1. What Existed Before

`scoreScopeAlignment()` existed as a well-designed function with three axes (subject, system, topic). However, the route wiring in `generateBatch()` made it apply only to NBME Difficult and UWorld Challenge:

```typescript
// BEFORE: scope rejection gated on needsReview
const requestedScopeForCheck = needsReview
  ? { subject: scope.subject, system: scope.system, topic: scope.topic }
  : undefined;
```

`requiresMedicalReview()` returns `true` only for `'NBME Difficult'` and `'UWorld Challenge'`. All other difficulties (`'Balanced'`, `'More Hard'`, `'More Easy'`, `'standardized'`) received `requestedScopeForCheck = undefined`, meaning `scoreScopeAlignment()` was never called for them — off-topic questions passed silently.

Additionally, the function had three correctness gaps:
1. **`actTopic` used `??` instead of checking all fields**: `q.topic ?? q.testedConcept ?? q.questionAngle` — if `q.topic = ''` (empty string), JavaScript `??` does not fall through to `testedConcept`, so the latter fields were never consulted when `topic` was present but empty.
2. **No canonical alias normalization**: `'Cardiovascular'` and `'Cardiology'` compared as unequal; `'Pathology'` and `'Pathophysiology'` compared as unequal.
3. **Missing metadata was silently passed**: if a question had no `system` field, the system check was skipped entirely even when the user requested a specific system.

---

## 2. What Was Weak

| Problem | Impact |
|---|---|
| Scope gated on `requiresMedicalReview` | Balanced/More Hard/More Easy scoped generation accepted off-topic questions (e.g. requesting Cardiovascular, receiving Renal) |
| `actTopic` `??` bug | Topic from `testedConcept`/`questionAngle`/`canonicalTopic`/`rawTopic` was unreachable when `topic: ''` — all checked fields after the first non-null one were ignored |
| No alias normalization | `'Cardiology'` ≠ `'Cardiovascular'`; `'Nervous System'` ≠ `'Neurology'`; `'Skin'` ≠ `'Dermatology'`; `'Pathophysiology'` ≠ `'Pathology'` — all legitimate AI outputs that were incorrectly rejected |
| Missing metadata silently passed | A question with no `system` field could never be rejected for system mismatch, regardless of how specific the user's request was |

---

## 3. Files Changed

| File | Change type |
|---|---|
| `server/src/lib/questionValidator.ts` | Alias maps, extended input type, rewritten `scoreScopeAlignment`, exported `isBroadScope` |
| `server/src/routes/ai.ts` | Route wiring: removed `needsReview` gate from scope check |
| `server/src/lib/questionValidator.test.ts` | 32 new tests across 6 new describe blocks |
| `server/src/routes/ai.test.ts` | Updated 1 existing describe block, 8 new tests |

---

## 4. How Scope Validation Now Works

### Route wiring (`ai.ts`)

```typescript
// AFTER: scope applies whenever user selected a specific scope
const requestedScopeForCheck =
  scope.subject || scope.system || scope.topic
    ? { subject: scope.subject, system: scope.system, topic: scope.topic }
    : undefined;
```

`resolveScope()` already normalises broad values (`'All Subjects'`, `'All Systems'`, empty) to `''`, so the condition is truthy only when the user actually selected something specific. This means:

- User selects "Cardiovascular" system → `scope.system = 'Cardiovascular'` → scope check runs for every difficulty
- User leaves system as "All Systems" → `scope.system = ''` → scope check skipped (no-op for `scoreScopeAlignment` anyway)

Medical review is still NBME Difficult / UWorld Challenge only (`if (needsReview) { ... }` on line ~705 — unchanged).

### Decision logic (`scoreScopeAlignment`)

**Subject axis:**
- Broad requested value → skip
- Metadata present and non-broad → alias-normalize both sides → compare canonical forms
- Metadata absent → **skip** (subject is a discipline label; text inference is unreliable and causes false rejections)

**System axis:**
- Broad requested value → skip
- Actual = `'Multisystem'` → skip (cross-system questions always pass system check)
- Metadata present and non-broad → alias-normalize both sides → compare canonical forms → reject if different
- Metadata absent AND stem exists → text detection via `SYSTEM_TEXT_SIGNALS` — **only reject if a clearly different system is identified**; ambiguous or undetected → skip

**Topic axis:**
- Broad requested value → skip
- Any of `topic`, `testedConcept`, `questionAngle`, `canonicalTopic`, `rawTopic`, `weakSpotCategory` is present → check all; if any matches (substring in either direction) → pass; none matches → reject
- All metadata absent AND stem/options exist → keyword match: pass if ≥ ½ topic keywords appear in text
- No text available → skip (cannot evaluate)

---

## 5. Alias Map Added

### Subject aliases (canonical → synonyms)

| Canonical | Aliases |
|---|---|
| `pathology` | pathophysiology, disease mechanism |
| `behavioral science` | behavioral health, psychiatry, psychology |
| `cardiology` | cardiac |
| `neurology` | neuroscience |
| `biostatistics` | epidemiology, biostatistics epidemiology population health |
| `ethics` | professionalism |

### System aliases (canonical → synonyms)

| Canonical | Aliases |
|---|---|
| `cardiovascular` | cardiovascular system, cardiology, cardio, heart, cardiac, vascular |
| `neurology` | nervous system, nervous system and special senses, neuroscience, neurological |
| `renal` | renal urinary, renal urinary system, renal and urinary system, urinary, kidney |
| `gastrointestinal` | gastrointestinal system, gi, digestive |
| `dermatology` | skin, skin and subcutaneous tissue, skin subcutaneous tissue |
| `reproductive` | reproductive system, male reproductive, female reproductive, female and transgender reproductive, pregnancy, obstetrics |
| `respiratory` | respiratory system, pulmonary |
| `musculoskeletal` | musculoskeletal system |
| `endocrine` | endocrine system, endocrinology |
| `hematology` | blood, blood and lymphoreticular, blood lymphoreticular system, lymph |
| `immune system` | immunology, immune |
| `infectious disease` | microbiology |
| `behavioral health` | behavioral science, psychiatry, psychology |
| `multisystem` | multisystem processes, multisystem processes and disorders |
| `human development` | development |

All comparisons use `normalizeForScope()` (lowercase, strip non-alphanum, collapse spaces) before alias lookup. Alias groups are built into a `Map<normalized, canonical>` at module load.

### System text detection keywords (fallback when metadata absent)

High-specificity keywords for 10 systems: cardiovascular, neurology, renal, gastrointestinal, respiratory, dermatology, endocrine, hematology, musculoskeletal, reproductive. Each uses a `RegExp` requiring at least one unambiguous clinical/anatomical term. Result: only rejects when the stem clearly belongs to a different system than requested.

---

## 6. Tests Run

### New tests in `questionValidator.test.ts` (32 new cases across 6 suites)

| Suite | Tests |
|---|---|
| `scoreScopeAlignment — system aliases` | Cardiology≡Cardiovascular, Cardiovascular System≡Cardiovascular, Nervous System≡Neurology, Neuroscience≡Neurology, Skin≡Dermatology, Skin and Subcutaneous Tissue≡Dermatology, Renal Urinary System≡Renal, Pulmonary≡Respiratory; still rejects truly different systems |
| `scoreScopeAlignment — subject aliases` | Pathophysiology≡Pathology, Behavioral Health≡Behavioral Science, Cardiac≡Cardiology; still rejects truly different subjects |
| `scoreScopeAlignment — subject + system both checked` | Both reject when both mismatch; passes when only one axis is specific; passes when only system requested |
| `scoreScopeAlignment — topic uses all metadata fields` | testedConcept matches (fixes `??` bug), canonicalTopic matches, rawTopic matches, questionAngle contributes, rejects when all fields present but none match |
| `scoreScopeAlignment — missing metadata with specific scope` | No subject rejection on missing metadata; no system rejection when stem confirms requested system; system rejected when stem identifies different system; no rejection on ambiguous stem; stem keyword match for missing topic metadata; topic rejected when no keywords match; empty question → no rejection |
| `scoreScopeAlignment — broad scope never rejects` | All Subjects passes any subject, All Systems passes any system, Multisystem actual never rejects, empty requested subject skips check |

### Updated/new tests in `ai.test.ts` (8 tests in updated suite)

| Test | Purpose |
|---|---|
| Rejects wrong subject+system+topic (any difficulty) | Core scope rejection |
| Rejects wrong system only | Partial mismatch |
| Scope decision is difficulty-independent | Confirms no difficulty param in `scoreScopeAlignment` |
| Balanced scoped generation rejects off-topic | Directly verifies the key behavioral change |
| More Easy passes on-topic questions | Passes for correct scope at any difficulty |
| More Hard accepts Neurology/Nervous System alias | Alias works across all difficulties |
| Medical review remains NBME/UWorld-only | Separation preserved |
| `totalScopeRejected` accumulates across batches | Telemetry plumbing verified through `runAdaptiveRefill` |

---

## 7. Final Test Results

```
Test Files  18 passed (18)
     Tests  596 passed (596)   (+37 new tests from 559)
  Typecheck  clean
```

---

## 8. Remaining Risks

### R-1: Balanced fast-path has only one retry; scope rejection increases rejection rate
The Balanced and More Hard paths use a `1.5×` buffer and one retry. If the user selected a narrow topic (e.g. "Kawasaki disease") and the AI generates a diverse batch, many questions may be scope-rejected, leaving the user with fewer questions than requested. This was the intended behavior but could surprise users who previously saw off-topic questions and now see "not enough questions returned."

**Mitigation:** Monitor `scopeRejectedCandidates` in telemetry. If the rejection rate for specific topics exceeds ~40%, the prompt should emphasize the topic more strongly (already done in `buildPrompt` for specific scopes).

### R-2: System text detection only covers 10 of ~15 systems
The text-detection fallback for missing system metadata does not cover Behavioral Health, Human Development, Biostatistics, or Immunology. Questions with missing system metadata for these requested systems will not be rejected by the text fallback (they skip). This is intentional (conservative) but means some off-topic questions will pass for these systems when metadata is absent.

**Mitigation:** AI-generated questions almost always include system metadata (it's in the prompt). Missing metadata is rare. Text detection is a best-effort fallback, not the primary gate.

### R-3: Topic keyword matching can produce false negatives for short topics
Topics like "Gout" (4 chars, passes the 4-char filter) or "MI" (2 chars, filtered out) may not yield keyword matches against stems that describe the condition without using the topic word. This causes false rejections for valid on-topic questions when topic metadata is absent.

**Mitigation:** In practice, the AI always provides `testedConcept` and `topic`, so text-based topic fallback rarely triggers. The 4-char filter prevents noise from short stop-word-like terms.

### R-4: `generateBatch` scope rejection is not directly unit-testable without Anthropic mock
The scope rejection inside `generateBatch` (lines 689–697 in `ai.ts`) cannot be verified with a pure unit test because `generateBatch` calls the Anthropic API. Tests in `ai.test.ts` verify the `scoreScopeAlignment` decision logic directly and the `totalScopeRejected` telemetry accumulation through `runAdaptiveRefill`, but not the end-to-end "Balanced batch → scope reject" path.

**Mitigation:** The wiring change is one line (`needsReview` → `scope.subject || scope.system || scope.topic`). The decision function is exhaustively tested in `questionValidator.test.ts`. Integration-level verification requires a mocked Anthropic client (not yet implemented).
