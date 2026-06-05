# Medica Full App Audit Report

Generated: 2026-06-04  
Scope: full frontend and backend architecture audit  
Rule followed: no functional code changed; this file is the only created artifact.

## 1. Executive Summary

Medica is no longer a small quiz app. It is becoming a full adaptive medical learning engine with quiz generation, question validation, exam/practice/coach modes, mastery tracking, spaced review, daily study plans, flashcards, reports, and USMLE-style taxonomy.

The product direction is strong. The biggest risk is not missing features anymore. The biggest risk is trust: whether every generated question, answer, explanation, result, flashcard, and recommendation can be proven reliable.

Overall score today: 7.4 / 10

MVP score: 8.2 / 10

Production readiness score: 6.4 / 10

Startup potential score: 8.5 / 10 if the validation and learning-loop architecture becomes truly backend-controlled.

Current status:

| Area | Status | Plain-English Meaning |
|---|---:|---|
| Frontend app | Strong | The user-facing product has many real learning flows working. |
| Backend type safety | Strong | Backend TypeScript typecheck passes. |
| Frontend tests | Strong | Frontend test suite passes. |
| Backend tests | Red | Backend tests currently fail because the new cardio-pathology validator is not matching its own expected cases. |
| Question generation | Promising | Generation has validation, repair, medical review, bank fallback, and difficulty-specific behavior. |
| Validation architecture | Medium risk | Validators exist, but the system is still not cleanly layered into universal, scope, subject-system, NBME, and UWorld validators. |
| Learning loop | Promising but split | Mastery, reports, flashcards, SRS, and analytics exist, but localStorage and backend data can drift. |
| Maintainability | Medium risk | Some central files are too large and carry too much responsibility. |

Main verdict:

Medica is a serious MVP with unusually strong ambition. It is not yet a 10/10 trusted adaptive platform because validation, persistence, reporting, and result-matrix truth are still split across too many places.

The most urgent thing is to make the backend the single source of truth for hard validation and learning data, then make the frontend a clean display/client layer.

## 2. Priority Issues

| Priority | Issue | Files / Areas | Why It Matters | Suggested Fix |
|---|---|---|---|---|
| P0 | Backend test suite is failing | `C:\Users\Pope\OneDrive\Desktop\Medica Claude\server\src\lib\cardioPathologyValidator.ts`, `C:\Users\Pope\OneDrive\Desktop\Medica Claude\server\src\lib\cardioPathologyValidator.test.ts`, `C:\Users\Pope\OneDrive\Desktop\Medica Claude\server\src\lib\questionValidator.test.ts` | This blocks production confidence. The validator often returns `not_applicable` when tests expect `pass`, `warn`, or `fail`. | Fix domain detection so cardio-pathology rules apply when the question is truly cardiovascular + pathology, not only when narrow keywords match. |
| P0 | Specialty validator logic is too conservative | Same files as above | Good test cases are being skipped. That means bad questions could pass because the validator decides "this rule does not apply." | Build a cleaner domain resolver using explicit metadata first, then text fallback. |
| P1 | Validation is not fully layered | `questionValidator.ts`, `cardioPathologyValidator.ts`, `generateAIQuestions.js` | Universal validation, scope validation, NBME validation, UWorld validation, and rule packs are mixed conceptually. | Use a validator pipeline: base -> scope -> subject/system rule pack -> NBME/UWorld difficulty layer -> medical review. |
| P1 | Frontend and backend validators can drift | `C:\Users\Pope\OneDrive\Desktop\Medica Claude\medica-app\src\lib\ai\generateAIQuestions.js`, `C:\Users\Pope\OneDrive\Desktop\Medica Claude\server\src\lib\questionValidator.ts` | A question may pass frontend fallback but fail backend live generation, or the reverse. That damages trust. | Keep backend as source of truth. Frontend validator should be lightweight pre-check only or use shared generated rules. |
| P1 | AI route contains too much business logic | `C:\Users\Pope\OneDrive\Desktop\Medica Claude\server\src\routes\ai.ts` | Routes should parse and return. This route handles generation, repair, medical review, telemetry, fallback, and validation orchestration. | Extract logic into existing or new approved service layer later. Do not do it during urgent validator fix. |
| P1 | Learning data is split between localStorage and backend | `dataProvider.js`, `storage.js`, backend exam/mastery routes | The app can show results that are not perfectly aligned with backend truth. | Make backend canonical for sessions, attempts, reports, mastery, and flashcards; keep localStorage as cache only. |
| P1 | Report loop is not yet a full trust loop | `questionReports` backend files, `generateAIQuestions.js`, `storage.js` | Users can report questions, but the app needs stronger quarantine, analytics, admin review, and generator feedback. | Build "reported -> quarantined -> reviewed -> fixed/trusted/rejected" lifecycle. |
| P2 | Scope validation is tied too much to hard modes | `questionValidator.ts`, `routes/ai.ts` | If the user chooses Cardiology + Pathology, scope correctness should be checked regardless of difficulty. | Apply scope validation whenever a specific scope is selected. Keep NBME/UWorld style validation difficulty-gated. |
| P2 | Subject/system labels are inconsistent | `quizTypes.js`, `mockQuestions.js`, question banks | Examples: `Dermatology` selector vs `Skin` bank; `Behavioral Science` vs `Behavioral Health`; `Neurology` and `Neuroscience`. | Normalize labels with canonical IDs and display names. |
| P2 | Result matrix is not yet unified | Exam, practice, coach, analytics, mastery files | A 10/10 app needs one clear truth for answer, concept, system, subject, task, reason, time, confidence, and next action. | Create a canonical attempt/result matrix shape and map every mode into it. |
| P2 | Flashcards are improving but still not fully concept-first | `flashcardGenerator.js`, `flashcardValidator.js`, flashcard UI | Good flashcards should test one concept, not replay the full missed question. | Keep enforcing minimum information principle and connect cards to concept/subconcept tags. |
| P2 | Analytics chunk is large | Frontend build, `AnalyticsDashboard.jsx` | Build passes, but the analytics area is heavy. | Continue lazy loading and split heavier chart/panel modules. |
| P3 | CSS is still too centralized | `App.css` | Big shared CSS can cause accidental visual regressions. | Gradually move styles closer to feature areas or stable design tokens. |
| P3 | Some naming creates confusion | `scoreNbmeStyle` in general validation path | A non-NBME function with NBME in the name causes wrong mental models. | Rename later to clinical-vignette scoring. |

## 3. Flow Map

### Quiz Generation Flow

| Step | What Happens | Key Files |
|---|---|---|
| 1 | User selects mode, count, difficulty, system, subject, and topic. | `C:\Users\Pope\OneDrive\Desktop\Medica Claude\medica-app\src\App.jsx`, `C:\Users\Pope\OneDrive\Desktop\Medica Claude\medica-app\src\lib\quizTypes.js` |
| 2 | Frontend asks for questions through the generation layer. | `C:\Users\Pope\OneDrive\Desktop\Medica Claude\medica-app\src\lib\ai\generateAIQuestions.js` |
| 3 | Backend live AI generation is used when enabled. | `C:\Users\Pope\OneDrive\Desktop\Medica Claude\server\src\routes\ai.ts` |
| 4 | Backend validates, repairs, and may medical-review hard questions. | `C:\Users\Pope\OneDrive\Desktop\Medica Claude\server\src\lib\questionValidator.ts` |
| 5 | Local bank/trusted bank can fill gaps or fallback. | `C:\Users\Pope\OneDrive\Desktop\Medica Claude\medica-app\src\lib\mockQuestions.js`, `C:\Users\Pope\OneDrive\Desktop\Medica Claude\medica-app\src\lib\questionBanks\` |
| 6 | Questions are normalized and routed into exam, practice, or coach. | `App.jsx`, `QuizSession.jsx`, `PracticeInterface.jsx`, `CoachInterface.jsx` |

### Session Flow

| Mode | Main Component | Behavior |
|---|---|---|
| Exam | `C:\Users\Pope\OneDrive\Desktop\Medica Claude\medica-app\src\components\exam\QuizSession.jsx` | Timed session, delayed results, exam-like behavior. |
| Practice | `C:\Users\Pope\OneDrive\Desktop\Medica Claude\medica-app\src\components\practice\PracticeInterface.jsx` | Immediate learning feedback after answering. |
| Coach | `C:\Users\Pope\OneDrive\Desktop\Medica Claude\medica-app\src\components\coach\CoachInterface.jsx` | More guided explanations, weak spots, flashcard support. |

### Result and Learning Flow

| Step | What Happens | Key Files |
|---|---|---|
| 1 | Answer is scored and normalized. | `answerNormalize.js`, `practiceScoring.js`, `coachScoring.js`, backend `ExamService.ts` |
| 2 | Result is saved locally and sometimes backend best-effort. | `storage.js`, `dataProvider.js`, backend exam routes |
| 3 | Analytics calculate performance and trends. | `analyticsEngine.js`, backend analytics services |
| 4 | Mastery engine updates concept strength. | backend mastery services and repositories |
| 5 | Daily plan and spaced review use mastery data. | `StudyPrescriptionService.ts`, mastery routes, `StudyPrescriptionPanel.jsx` |
| 6 | Flashcards are generated from missed knowledge. | `flashcardGenerator.js`, `flashcardValidator.js`, flashcard routes |

## 4. Architecture Map

| Area | Path | Role | Audit Notes |
|---|---|---|---|
| App shell | `C:\Users\Pope\OneDrive\Desktop\Medica Claude\medica-app\src\App.jsx` | Central frontend flow controller | Important but large. It holds many product decisions. |
| Quiz builder | `C:\Users\Pope\OneDrive\Desktop\Medica Claude\medica-app\src\components\quiz-builder\` | User selects quiz settings | Needs canonical subject/system labels. |
| Exam UI | `C:\Users\Pope\OneDrive\Desktop\Medica Claude\medica-app\src\components\exam\` | Timed quiz experience | Functional; UX can still be polished. |
| Practice UI | `C:\Users\Pope\OneDrive\Desktop\Medica Claude\medica-app\src\components\practice\` | Immediate feedback mode | Good learning value. |
| Coach UI | `C:\Users\Pope\OneDrive\Desktop\Medica Claude\medica-app\src\components\coach\` | Guided explanation mode | Strong concept, but needs deeper concept/subconcept discipline. |
| Question generation frontend | `C:\Users\Pope\OneDrive\Desktop\Medica Claude\medica-app\src\lib\ai\generateAIQuestions.js` | Frontend generation orchestration | Too much validation duplication lives here. |
| Question banks | `C:\Users\Pope\OneDrive\Desktop\Medica Claude\medica-app\src\lib\questionBanks\` | Local bank split by difficulty/style | Good move for bundle size and organization. |
| Storage | `C:\Users\Pope\OneDrive\Desktop\Medica Claude\medica-app\src\lib\storage.js` | localStorage persistence | Useful for MVP, risky as source of truth. |
| Backend app | `C:\Users\Pope\OneDrive\Desktop\Medica Claude\server\src\app.ts` | Express app wiring | Clean router mounting overall. |
| AI route | `C:\Users\Pope\OneDrive\Desktop\Medica Claude\server\src\routes\ai.ts` | AI generation endpoints | Too much business logic in route. |
| Backend validator | `C:\Users\Pope\OneDrive\Desktop\Medica Claude\server\src\lib\questionValidator.ts` | Main server validation | Critical file. Needs cleaner layered pipeline. |
| Cardio-path validator | `C:\Users\Pope\OneDrive\Desktop\Medica Claude\server\src\lib\cardioPathologyValidator.ts` | Specialty validation pack | Good direction, currently failing tests. |
| Mastery services | `C:\Users\Pope\OneDrive\Desktop\Medica Claude\server\src\services\` | Learning engine logic | Stronger architecture than frontend local analytics. |
| Repositories | `C:\Users\Pope\OneDrive\Desktop\Medica Claude\server\src\repositories\` | DB and memory implementations | Good pattern. Keep it. |
| Schemas | `C:\Users\Pope\OneDrive\Desktop\Medica Claude\server\src\schemas\` | Request validation | Correct direction. |

## 5. Validator Map

### Current Validator Layers

| Layer | Current Status | Files | Risk |
|---|---|---|---|
| Basic structure | Present | `questionValidator.ts`, `generateAIQuestions.js` | Good, but duplicated. |
| Answer support | Present | `questionValidator.ts`, `generateAIQuestions.js` | Improved, but drift risk remains. |
| Contradiction detection | Present | `questionValidator.ts`, `generateAIQuestions.js` | Better than before, but not perfect. |
| Scope validation | Present but not ideal | `questionValidator.ts`, `routes/ai.ts` | Should apply whenever specific scope is selected, not only hard modes. |
| NBME style validation | Present and difficulty-gated | `questionValidator.ts` | Good that it only applies to `NBME Difficult`. |
| UWorld difficulty/depth validation | Partial | `routes/ai.ts`, `questionValidator.ts` | Needs its own explicit layer. |
| Medical review | Present for hard modes | `routes/ai.ts`, `questionValidator.ts` | Good direction. Cost/latency must be watched. |
| Specialty rule packs | Started | `cardioPathologyValidator.ts` | Right idea, but current tests fail. |
| Flashcard validation | Present | `flashcardValidator.js` | Good MVP. Needs concept-first enforcement. |

### Ideal Validator Pipeline

| Order | Validator | Applies When | Purpose |
|---:|---|---|---|
| 1 | Base medical MCQ validator | Every generated question | Must be structurally valid, one correct answer, plausible distractors, no contradictions. |
| 2 | Universal concept validator | Every selected system + subject | Ensures the question tests one teachable concept in the requested domain. |
| 3 | Scope validator | Whenever user selects specific system/subject/topic | Rejects off-topic questions. |
| 4 | Subject-system rule pack | Matching pair only, such as Cardiovascular + Pathology | Adds domain-specific medical logic checks. |
| 5 | NBME validator | Only `NBME Difficult` | Enforces NBME-style concise vignette, single best answer, exam-like wording. |
| 6 | UWorld validator | Only `UWorld Challenge` | Enforces deeper multi-step reasoning and explanation quality. |
| 7 | AI medical review | Hard modes only | Uses model as reviewer, not generator, to catch subtle medical issues. |

### Cardio-Pathology Rule Pack Status

| Finding | Status |
|---|---|
| Separate validator exists | Yes |
| Integrated into main validator | Yes |
| Typecheck passes | Yes |
| Tests pass | No |
| Main failure | Domain detection returns `not_applicable` too often |
| Recommended fix | Use explicit metadata first, then broader cardiovascular/pathology text fallback |

## 6. Data Map

| Data Type | Current Storage | Backend Exists? | Risk |
|---|---|---:|---|
| Quiz questions | AI response, local bank, trusted generated bank | Partial | Need clear source of truth per question. |
| User answers | Frontend state, localStorage, backend exam attempts | Yes | Risk of local/backend drift. |
| Exam sessions | localStorage and backend | Yes | Backend should become canonical. |
| Practice/coach results | Mostly frontend/local analytics path | Partial | Needs unified result matrix. |
| Mastery | Backend services/repositories | Yes | Stronger than local analytics. |
| Daily plan | Backend endpoint + frontend display | Yes | Good direction. |
| Spaced review | Backend persisted fields | Yes | Good direction. |
| Flashcards | localStorage and backend routes | Yes | Needs concept/subconcept-first source. |
| Question reports | localStorage and backend report route | Yes | Needs full quarantine/review loop. |
| Analytics | Frontend computed + backend analytics | Yes | Split truth risk. |
| Taxonomy | Frontend enrichment and question metadata | Partial | Need canonical IDs and backend validation. |

Beginner explanation:

Right now Medica has two brains for some data: the browser and the server. That was good for fast MVP building, but a trusted medical learning product should eventually have one main brain: the backend. The browser can cache and display, but the backend should decide the truth.

## 7. Result Matrix Map

### Current Result Matrix

| Field | Current Coverage | Notes |
|---|---|---|
| Question ID | Good | Exists in generated/local questions. |
| Correct answer | Good | Normalization improved. |
| User answer | Good | Captured in sessions. |
| Is correct | Good | Shared normalization improved, but every mode should use one path. |
| System | Good but label mismatch exists | Needs canonical IDs. |
| Subject | Good but label mismatch exists | Needs canonical IDs. |
| Topic | Good | Present in question metadata. |
| Subconcept | Partial | Needs stronger concept model. |
| Physician task | Good direction | Present in taxonomy. |
| USMLE content area | Good direction | Present in taxonomy. |
| Difficulty | Good | Used for NBME/UWorld behavior. |
| Time spent | Partial | Exam-oriented, not fully central across all modes. |
| Confidence | Partial | Useful for mastery, not fully unified. |
| Explanation quality | Validated in parts | Stronger on backend hard modes. |
| Report status | Partial | Needs product-level quarantine lifecycle. |
| Mastery update | Good backend direction | Needs one canonical result feed. |
| Next action | Good start | Daily plan/SRS exist, but need stronger result linkage. |

### Ideal Medica Result Matrix

Every answered question should become one clean row like this:

| Column | Why It Matters |
|---|---|
| userId | Who learned. |
| sessionId | Which quiz session. |
| mode | Exam, practice, or coach. |
| questionId | Which question. |
| questionFingerprint | Detects duplicate/near-duplicate content. |
| source | AI, local bank, trusted bank, imported, or repaired. |
| difficulty | Balanced, UWorld, NBME, etc. |
| systemId | Canonical system. |
| subjectId | Canonical subject. |
| conceptId | Main concept being tested. |
| subconceptId | Specific tested detail. |
| physicianTask | Clinical task being tested. |
| userAnswer | What user chose. |
| correctAnswer | Correct answer. |
| isCorrect | Boolean result. |
| timeSpentSeconds | Speed and confidence signal. |
| confidence | User confidence if collected. |
| validatorVersion | Which validator approved the question. |
| reportStatus | Clean, reported, quarantined, fixed, or rejected. |
| masteryDelta | How this changed mastery. |
| nextReviewAt | SRS next step. |

This is the heart of a 10/10 Medica learning engine.

## 8. Quick Wins

| Rank | Quick Win | Why It Helps |
|---:|---|---|
| 1 | Fix backend cardio-pathology tests | Removes the current red build blocker. |
| 2 | Make domain detection metadata-first | Stops specialty validators from skipping valid cases. |
| 3 | Add validator pipeline names to output telemetry | Makes it clear why a question passed or failed. |
| 4 | Normalize system/subject labels | Prevents filter bugs and analytics confusion. |
| 5 | Make scope validation always run for specific selections | Stops off-topic questions earlier. |
| 6 | Rename confusing `scoreNbmeStyle` general function | Reduces future developer mistakes. |
| 7 | Make backend report quarantine visible in generation logs | Builds trust that reported questions disappear. |
| 8 | Add one canonical result matrix mapper | Makes exam/practice/coach feed the same learning engine. |
| 9 | Split large AI route responsibilities after tests are green | Improves maintainability without changing product behavior. |
| 10 | Add a small validator dashboard for internal QA | Shows pass/fail/reason counts across generated batches. |

## 9. Refactor Plan

### Phase A: Stabilize Current Work

Goal: make the current app green and trustworthy again.

1. Fix `cardioPathologyValidator.ts` domain detection.
2. Keep NBME validation only for `NBME Difficult`.
3. Keep UWorld depth validation only for `UWorld Challenge`.
4. Run backend tests until all pass.
5. Run frontend tests and builds again.

Success target:

| Check | Target |
|---|---|
| Backend tests | 100% passing |
| Frontend tests | 100% passing |
| Backend typecheck | Passing |
| Frontend build | Passing |

### Phase B: Clean Validator Architecture

Goal: make validation understandable and scalable.

Recommended structure:

| Layer | Example |
|---|---|
| Base validator | Is this a valid medical MCQ? |
| Scope validator | Is this really Cardiovascular + Pathology? |
| Universal concept validator | Does it test one clear concept? |
| Rule-pack validator | Does cardio-pathology logic make medical sense? |
| Difficulty style validator | Is this NBME or UWorld style when requested? |
| Medical review | Does AI reviewer approve hard-mode quality? |

Rule packs to add first:

1. Cardiovascular + Pathology
2. Cardiovascular + Physiology
3. Renal + Physiology
4. Renal + Pathology
5. Pharmacology + Cardiovascular
6. Microbiology + Infectious Disease

### Phase C: Canonical Result Matrix

Goal: make every learning action feed one trustworthy learning model.

Work:

1. Define one result row shape.
2. Map exam, practice, and coach into that shape.
3. Send result rows to backend.
4. Update mastery, SRS, flashcards, and analytics from that row.

Why this matters:

Without one result matrix, the app can become many separate tools. With one matrix, Medica becomes an adaptive learning engine.

### Phase D: Real Report Loop

Goal: reported questions should improve the product.

Lifecycle:

| Status | Meaning |
|---|---|
| clean | Normal question. |
| reported | User flagged it. |
| quarantined | Hidden from future sessions. |
| reviewed | Human or trusted reviewer checked it. |
| fixed | Can return to bank. |
| rejected | Permanently removed. |

Required behavior:

1. Report button creates backend report.
2. Reported fingerprint is hidden from future generation/local bank.
3. Report analytics show most common problems.
4. Good AI questions can become trusted bank questions only after validation.

### Phase E: Backend Source of Truth

Goal: backend becomes the main brain.

Move toward:

| Current | Target |
|---|---|
| localStorage-first sessions | Backend-first sessions |
| Frontend analytics | Backend analytics with frontend display |
| Frontend report cache | Backend report lifecycle |
| Mixed result paths | One result matrix |
| Mirrored validators | Backend validator authority |

## 10. Questions for Me

No blocking questions. The next technical step is clear:

Fix the backend cardio-pathology validator until backend tests are green.

Assumptions I used:

1. Medica should become a trusted adaptive learning engine, not just a quiz generator.
2. Backend should eventually be the source of truth for validation, reports, mastery, and analytics.
3. NBME validation should only apply when `NBME Difficult` is selected.
4. UWorld depth validation should only apply when `UWorld Challenge` is selected.
5. Subject-system rule packs should be custom, but should plug into one universal validator pipeline.

## Test and Build Snapshot

| Check | Result |
|---|---|
| Frontend tests | Passed: 394 tests |
| Frontend build | Passed |
| Backend typecheck | Passed |
| Backend tests | Failed: 13 failing tests |

Backend failure summary:

| Failure Area | Meaning |
|---|---|
| `cardioPathologyValidator.test.ts` | Specialty validator is skipping cases as `not_applicable`. |
| `questionValidator.test.ts` | Integrated specialty validation expectation does not match current output. |

Final audit verdict:

Medica has the foundation of a powerful medical learning product. The current weakness is not product ambition. It is validator and data-truth discipline. Fix that, and the project moves from impressive MVP to genuinely credible platform.
