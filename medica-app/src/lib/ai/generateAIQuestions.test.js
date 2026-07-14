import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Force VITE_USE_BACKEND_API=true for all tests in this file
vi.stubEnv('VITE_USE_BACKEND_API', 'true')

// Mock the static bank so existing tests that stub fetch still exercise the AI path.
// Individual bank-first tests override this per-test via mockReturnValue.
vi.mock('../mockQuestions.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    getBankQuestionsForConfig: vi.fn(() => []),
  }
})

import { getBankQuestionsForConfig } from '../mockQuestions.js'

import {
  formatGenerationErrorMessage,
  generateAIQuestions,
  getGenerationTimeoutMs,
  getGenerationTimeoutMessage,
  isHardMedicalReviewGeneration,
  validateBankQuestion,
} from './generateAIQuestions.js'
import {
  appendTrustedGeneratedQuestions,
  getTrustedGeneratedQuestions,
  saveQuestionReport,
} from '../storage.js'
import { STANDARDIZED_40Q_BLOCK, STANDARDIZED_STEP1_BLOCK } from '../quizTypes.js'
import { setAuthSession } from '../apiClient.js'

const makeQuestion = (i, overrides = {}) => ({
  id:            `uuid-${i}`,            // server-assigned UUID format
  stem:          `A ${30 + i}-year-old patient presents to clinic with a unique complaint number ${i} requiring clinical reasoning.`,
  testedConcept: `Unique Concept ${i}`,
  correct:       'A',
  options:       [
    { letter: 'A', text: `Correct Mechanism ${i}` },
    { letter: 'B', text: `Distractor B ${i}` },
    { letter: 'C', text: `Distractor C ${i}` },
    { letter: 'D', text: `Distractor D ${i}` },
  ],
  explanation:   `Correct Mechanism ${i} explains this unique concept and is supported by the clinical findings.`,
  ...overrides,
})

const makeQuestions = (n, offset = 0) => Array.from({ length: n }, (_, i) => makeQuestion(i + offset))

function mockFetch(responses) {
  let call = 0
  return vi.fn(async () => {
    const resp = responses[call] ?? responses[responses.length - 1]
    call++
    return {
      ok:   resp.ok ?? true,
      json: async () => resp.body,
    }
  })
}

const baseConfig = { questionCount: 5, mode: 'practice' }

beforeEach(() => {
  vi.stubEnv('VITE_USE_BACKEND_API', 'true')
  setAuthSession('authenticated', 'test-user')
  // Reset bank mock to empty so existing tests exercise the full AI path by default.
  getBankQuestionsForConfig.mockReturnValue([])
})
afterEach(() => {
  setAuthSession('anonymous')
  localStorage.clear()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('generateAIQuestions - timeout policy', () => {
  it('uses the normal timeout for Balanced generation', () => {
    expect(getGenerationTimeoutMs({ ...baseConfig, difficulty: 'Balanced' })).toBe(180_000)
    expect(isHardMedicalReviewGeneration({ difficulty: 'Balanced' })).toBe(false)
  })

  it('uses a medium timeout for smaller hard-mode sets', () => {
    expect(getGenerationTimeoutMs({ ...baseConfig, difficulty: 'UWorld Challenge', questionCount: 10 })).toBe(360_000)
    expect(getGenerationTimeoutMs({ ...baseConfig, difficulty: 'NBME Difficult', questionCount: 10 })).toBe(360_000)
  })

  it('uses a long timeout for hard 40Q blocks', () => {
    expect(getGenerationTimeoutMs({ mode: 'exam', difficulty: 'UWorld Challenge', questionCount: 40 })).toBe(720_000)
    expect(getGenerationTimeoutMs({ mode: 'exam', difficulty: 'NBME Difficult', questionCount: 40 })).toBe(720_000)
  })

  it('formats a friendly hard-mode timeout message', () => {
    const msg = getGenerationTimeoutMessage({ mode: 'exam', difficulty: 'UWorld Challenge', questionCount: 40 })
    expect(msg).toContain('Challenge generation')
    expect(msg).toContain('medically reviewed')
  })

  it('formats hard-mode insufficient-count errors without raw technical wording', () => {
    const err = { code: 'AI_INSUFFICIENT_COUNT', returned: 24, requested: 40 }
    const msg = formatGenerationErrorMessage(err, { mode: 'exam', difficulty: 'NBME Difficult', questionCount: 40 })
    expect(msg).toContain('24')
    expect(msg).toContain('40')
    expect(msg).toContain('medically approved')
  })

  it('formats authentication and capacity failures as actionable messages', () => {
    expect(formatGenerationErrorMessage({ code: 'AUTH_REQUIRED_FOR_LIVE_AI' }, baseConfig))
      .toContain('Sign in from Settings')
    expect(formatGenerationErrorMessage({ code: 'RATE_LIMITED', status: 429 }, baseConfig))
      .toContain('temporarily at capacity')
  })

  it('turns fetch aborts into a friendly timeout error', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn((_url, opts) => new Promise((_resolve, reject) => {
      opts.signal.addEventListener('abort', () => {
        reject(Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' }))
      })
    })))

    const pending = expect(
      generateAIQuestions({ mode: 'exam', difficulty: 'UWorld Challenge', questionCount: 40 }),
    ).rejects.toMatchObject({ code: 'GENERATION_TIMEOUT' })
    await vi.advanceTimersByTimeAsync(720_000)

    await pending
    vi.useRealTimers()
  })
})

// Core success path

describe('generateAIQuestions - success path', () => {
  it('returns questions when server returns sufficient unique questions', async () => {
    vi.stubGlobal('fetch', mockFetch([{ body: { questions: makeQuestions(5) } }]))
    const result = await generateAIQuestions({ ...baseConfig, system: 'Cardiovascular' })
    expect(result).toHaveLength(5)
    expect(result[0].usmleContentArea).toBe('Cardiovascular System')
    expect(result[0].physicianTask).toBeTruthy()
  })

  it('preserves server generation telemetry on the returned question array', async () => {
    const telemetry = {
      medicalReviewRequested: 12,
      medicalReviewPassed: 8,
      stoppedReason: 'requested_count_reached',
    }
    vi.stubGlobal('fetch', mockFetch([{ body: { questions: makeQuestions(5), telemetry } }]))

    const result = await generateAIQuestions(baseConfig)

    expect(result.generationTelemetry).toMatchObject(telemetry)
  })

  it('returns partial questions when server returns fewer than requested', async () => {
    vi.stubGlobal('fetch', mockFetch([{ body: { questions: makeQuestions(3) } }]))
    const result = await generateAIQuestions(baseConfig)
    expect(result).toHaveLength(3)
  })

  it('throws AI_INSUFFICIENT_COUNT when server returns empty array', async () => {
    vi.stubGlobal('fetch', mockFetch([{ body: { questions: [] } }]))
    await expect(generateAIQuestions(baseConfig)).rejects.toThrow('Server returned empty question array')
  })
})

// Duplicate filtering (no throw)

describe('generateAIQuestions - duplicate filtering', () => {
  it('filters duplicate IDs silently instead of throwing', async () => {
    // Simulates an edge-case where two questions share an id (should never happen with UUIDs,
    // but the frontend filters defensively)
    const dupeId = [makeQuestion(0), makeQuestion(0)]  // same id, same stem
    vi.stubGlobal('fetch', mockFetch([{ body: { questions: dupeId } }]))
    const result = await generateAIQuestions(baseConfig)
    expect(result).toHaveLength(1)  // second duplicate filtered out
  })

  it('filters duplicate stems regardless of different ids', async () => {
    const q1 = makeQuestion(0, { id: 'uuid-a' })
    const q2 = { ...makeQuestion(0, { id: 'uuid-b' }), id: 'uuid-b' }  // different id, same stem
    vi.stubGlobal('fetch', mockFetch([{ body: { questions: [q1, q2, makeQuestion(1)] } }]))
    const result = await generateAIQuestions(baseConfig)
    // q1 kept, q2 filtered (same stem as q1), q3 kept
    expect(result).toHaveLength(2)
  })

  it('accepts fully unique questions without filtering', async () => {
    const qs = makeQuestions(5)
    vi.stubGlobal('fetch', mockFetch([{ body: { questions: qs } }]))
    const result = await generateAIQuestions(baseConfig)
    expect(result).toHaveLength(5)
  })
})

// Server error handling

describe('generateAIQuestions - server errors', () => {
  it('throws when server returns non-ok status', async () => {
    vi.stubGlobal('fetch', mockFetch([{ ok: false, body: { error: 'Internal error' } }]))
    await expect(generateAIQuestions(baseConfig)).rejects.toThrow('Internal error')
  })

  it('sends exclude list from seenState', async () => {
    const bodies = []
    vi.stubGlobal('fetch', vi.fn(async (_url, opts) => {
      bodies.push(JSON.parse(opts.body))
      return { ok: true, json: async () => ({ questions: makeQuestions(5) }) }
    }))
    const seenState = {
      seenIds:          new Set(['old-id-1']),
      seenBaseIds:      new Set(['old-id-1']),
      seenFingerprints: new Set(),
    }
    await generateAIQuestions(baseConfig, seenState)
    expect(bodies[0].exclude.questionIds).toContain('old-id-1')
  })

  it('filters previously seen questions by id when backend returns them anyway', async () => {
    const repeated = makeQuestion(0, { id: 'old-id-1' })
    vi.stubGlobal('fetch', mockFetch([{ body: { questions: [repeated, ...makeQuestions(4, 1)] } }]))
    const seenState = {
      seenIds:          new Set(['old-id-1']),
      seenBaseIds:      new Set(['old-id-1']),
      seenFingerprints: new Set(),
    }

    const result = await generateAIQuestions(baseConfig, seenState)

    expect(result).toHaveLength(4)
    expect(result.find(q => q.id === 'old-id-1')).toBeUndefined()
  })

  it('filters previously seen questions by fingerprint when backend returns a rewritten duplicate', async () => {
    const repeated = makeQuestion(0, { id: 'new-server-id' })
    vi.stubGlobal('fetch', mockFetch([{ body: { questions: [repeated, ...makeQuestions(4, 1)] } }]))
    const seenState = {
      seenIds:          new Set(),
      seenBaseIds:      new Set(),
      seenFingerprints: new Set([`${repeated.stem.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120)}||${repeated.testedConcept.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim()}`]),
    }

    const result = await generateAIQuestions(baseConfig, seenState)

    expect(result).toHaveLength(4)
    expect(result.find(q => q.id === 'new-server-id')).toBeUndefined()
  })
})

// 40Q Block strict enforcement

describe('generateAIQuestions - 40Q Block enforcement', () => {
  const config40Q = { questionCount: 40, mode: 'exam' }

  it('throws AI_INSUFFICIENT_COUNT when 40Q block gets fewer than 40 questions', async () => {
    vi.stubGlobal('fetch', mockFetch([{ body: { questions: makeQuestions(35) } }]))
    await expect(generateAIQuestions(config40Q))
      .rejects.toMatchObject({ code: 'AI_INSUFFICIENT_COUNT', returned: 35, requested: 40 })
  })

  it('throws with descriptive message naming the shortfall', async () => {
    vi.stubGlobal('fetch', mockFetch([{ body: { questions: makeQuestions(35) } }]))
    await expect(generateAIQuestions(config40Q))
      .rejects.toThrow('40 Question Block requires exactly 40 questions - AI returned 35')
  })

  it('returns all 40 when server provides exactly 40 unique questions', async () => {
    vi.stubGlobal('fetch', mockFetch([{ body: { questions: makeQuestions(40) } }]))
    const result = await generateAIQuestions(config40Q)
    expect(result).toHaveLength(40)
  })

  it('does NOT throw for non-exam mode with same count shortfall', async () => {
    const config40Practice = { questionCount: 40, mode: 'practice' }
    vi.stubGlobal('fetch', mockFetch([{ body: { questions: makeQuestions(35) } }]))
    const result = await generateAIQuestions(config40Practice)
    expect(result).toHaveLength(35)
  })
})

describe('generateAIQuestions - current standardized block enforcement', () => {
  it('rejects a partial current-format block instead of silently starting it', async () => {
    const config = {
      questionCount: 20,
      mode: 'exam',
      difficulty: 'Balanced',
      blockType: STANDARDIZED_STEP1_BLOCK,
    }
    vi.stubGlobal('fetch', mockFetch([{ body: { questions: makeQuestions(15) } }]))

    await expect(generateAIQuestions(config)).rejects.toMatchObject({
      code: 'AI_INSUFFICIENT_COUNT',
      returned: 15,
      requested: 20,
    })
  })
})

// BACKEND_DISABLED short-circuit

describe('generateAIQuestions - BACKEND_DISABLED', () => {
  it('throws BACKEND_DISABLED when env var is not true', async () => {
    vi.stubEnv('VITE_USE_BACKEND_API', 'false')
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    await expect(generateAIQuestions(baseConfig))
      .rejects.toMatchObject({ code: 'BACKEND_DISABLED' })
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('generateAIQuestions - medical consistency validation', () => {
  it('filters practice questions whose explanation does not support the marked correct answer', async () => {
    const unsupported = makeQuestion(0, {
      explanation: 'This explanation discusses a different unrelated concept without supporting the answer.',
    })
    vi.stubGlobal('fetch', mockFetch([{ body: { questions: [unsupported, ...makeQuestions(4, 1)] } }]))

    const result = await generateAIQuestions(baseConfig)

    expect(result).toHaveLength(4)
    expect(result.find(q => q.id === unsupported.id)).toBeUndefined()
  })

  it('filters explanations that identify a wrong option as the correct answer', async () => {
    const contradictory = makeQuestion(0, {
      explanation: 'Distractor B 0 is the correct answer because it explains the clinical findings.',
    })
    vi.stubGlobal('fetch', mockFetch([{ body: { questions: [contradictory, ...makeQuestions(4, 1)] } }]))

    const result = await generateAIQuestions(baseConfig)

    expect(result).toHaveLength(4)
    expect(result.find(q => q.id === contradictory.id)).toBeUndefined()
  })

  it('requires option explanations for coach-mode questions', async () => {
    vi.stubGlobal('fetch', mockFetch([{ body: { questions: makeQuestions(5) } }]))

    await expect(generateAIQuestions({ questionCount: 5, mode: 'coach' }))
      .rejects.toMatchObject({ code: 'AI_INSUFFICIENT_COUNT', returned: 0, requested: 5 })
  })

  it('accepts coach-mode questions with all option explanations', async () => {
    const questions = makeQuestions(5).map(q => ({
      ...q,
      optionExplanations: {
        A: `${q.options[0].text} is supported by the vignette.`,
        B: 'This distractor does not match the mechanism.',
        C: 'This distractor does not match the clinical pattern.',
        D: 'This distractor does not match the expected finding.',
      },
    }))
    vi.stubGlobal('fetch', mockFetch([{ body: { questions } }]))

    const result = await generateAIQuestions({ questionCount: 5, mode: 'coach' })

    expect(result).toHaveLength(5)
  })

  it('filters malformed questions before quiz creation', async () => {
    const malformed = makeQuestion(0, {
      options: [{ letter: 'A', text: 'Only one option' }],
    })
    vi.stubGlobal('fetch', mockFetch([{ body: { questions: [malformed, ...makeQuestions(4, 1)] } }]))

    const result = await generateAIQuestions(baseConfig)

    expect(result).toHaveLength(4)
    expect(result.find(q => q.id === malformed.id)).toBeUndefined()
  })

  it('logs rejection reasons for invalid generated questions', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const malformed = makeQuestion(0, {
      options: [{ letter: 'A', text: 'Only one option' }],
    })
    const unsupported = makeQuestion(1, {
      explanation: 'This explanation discusses a different unrelated concept without supporting the answer.',
    })
    vi.stubGlobal('fetch', mockFetch([{ body: { questions: [malformed, unsupported, ...makeQuestions(3, 2)] } }]))

    await generateAIQuestions(baseConfig)

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('invalid_options=1'))
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('answer_not_supported=1'))
  })
})

describe('generateAIQuestions - trusted generated question bank', () => {
  it('stores validated generated questions for future reuse', async () => {
    vi.stubGlobal('fetch', mockFetch([{ body: { questions: makeQuestions(5) } }]))

    await generateAIQuestions(baseConfig)

    const trusted = getTrustedGeneratedQuestions()
    expect(trusted).toHaveLength(5)
    expect(trusted[0]).toMatchObject({ source: 'ai', mode: 'practice' })
    expect(trusted[0].usmleContentArea).toBeTruthy()
    expect(trusted[0].physicianTask).toBeTruthy()
  })

  it('does not store rejected generated questions', async () => {
    const unsupported = makeQuestion(0, {
      explanation: 'This explanation discusses a different unrelated concept without supporting the answer.',
    })
    vi.stubGlobal('fetch', mockFetch([{ body: { questions: [unsupported, ...makeQuestions(4, 1)] } }]))

    await generateAIQuestions(baseConfig)

    const trusted = getTrustedGeneratedQuestions()
    expect(trusted).toHaveLength(4)
    expect(trusted.find(q => q.id === unsupported.id)).toBeUndefined()
  })

  it('reuses enough trusted questions without calling the AI endpoint', async () => {
    appendTrustedGeneratedQuestions(makeQuestions(5), baseConfig)
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const result = await generateAIQuestions(baseConfig)

    expect(result).toHaveLength(5)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('calls the AI endpoint only for the missing remainder when trusted questions are partial', async () => {
    appendTrustedGeneratedQuestions(makeQuestions(2), baseConfig)
    const bodies = []
    vi.stubGlobal('fetch', vi.fn(async (_url, opts) => {
      bodies.push(JSON.parse(opts.body))
      return { ok: true, json: async () => ({ questions: makeQuestions(3, 2) }) }
    }))

    const result = await generateAIQuestions(baseConfig)

    expect(result).toHaveLength(5)
    expect(bodies[0].config.questionCount).toBe(3)
  })
})

// ── Server-owned Exam student-view flow ─────────────────────────────────────────

const makeStudentViewQuestion = (i, overrides = {}) => ({
  id:            `fp-${i}`,
  stem:          `A ${30 + i}-year-old patient presents to clinic with a unique complaint number ${i} requiring clinical reasoning.`,
  testedConcept: `Unique Concept ${i}`,
  options:       [
    { letter: 'A', text: `Mechanism A ${i}` },
    { letter: 'B', text: `Mechanism B ${i}` },
    { letter: 'C', text: `Mechanism C ${i}` },
    { letter: 'D', text: `Mechanism D ${i}` },
  ],
  subject: 'Pharmacology',
  system: 'Cardiovascular',
  ...overrides,
  // No correct/explanation/optionExplanations/pearl/etc — this mirrors exactly
  // what toStudentExamQuestion() on the backend returns.
})

const makeStudentViewQuestions = (n, offset = 0) => Array.from({ length: n }, (_, i) => makeStudentViewQuestion(i + offset))

const examConfig = { questionCount: 3, mode: 'exam' }

describe('generateAIQuestions - exam-mode server-owned student view', () => {
  it('sends clientSessionId in the generation request body', async () => {
    const bodies = []
    vi.stubGlobal('fetch', vi.fn(async (_url, opts) => {
      bodies.push(JSON.parse(opts.body))
      return { ok: true, json: async () => ({ questions: makeStudentViewQuestions(3), telemetry: { studentView: true, reserved: true } }) }
    }))

    await generateAIQuestions(examConfig, null, '11111111-1111-4111-8111-111111111111')

    expect(bodies[0].clientSessionId).toBe('11111111-1111-4111-8111-111111111111')
  })

  it('omits clientSessionId from the request body when none is provided', async () => {
    const bodies = []
    vi.stubGlobal('fetch', vi.fn(async (_url, opts) => {
      bodies.push(JSON.parse(opts.body))
      return { ok: true, json: async () => ({ questions: makeQuestions(3) }) }
    }))

    await generateAIQuestions(baseConfig)

    expect(bodies[0]).not.toHaveProperty('clientSessionId')
  })

  it('accepts student-view questions with no correct field instead of rejecting them as invalid', async () => {
    vi.stubGlobal('fetch', mockFetch([{
      body: { questions: makeStudentViewQuestions(3), telemetry: { studentView: true, reserved: true } },
    }]))

    const result = await generateAIQuestions(examConfig)

    expect(result).toHaveLength(3)
    expect(result[0]).not.toHaveProperty('correct')
  })

  it('propagates the studentView and reserved flags onto the returned array telemetry', async () => {
    vi.stubGlobal('fetch', mockFetch([{
      body: { questions: makeStudentViewQuestions(3), telemetry: { studentView: true, reserved: true, source: 'ai' } },
    }]))

    const result = await generateAIQuestions(examConfig)

    expect(result.generationTelemetry.studentView).toBe(true)
    expect(result.generationTelemetry.reserved).toBe(true)
  })

  it('does not cache answer-stripped student-view questions into the trusted-reuse pool', async () => {
    vi.stubGlobal('fetch', mockFetch([{
      body: { questions: makeStudentViewQuestions(3), telemetry: { studentView: true, reserved: true } },
    }]))

    await generateAIQuestions(examConfig)

    const trusted = getTrustedGeneratedQuestions()
    expect(trusted).toHaveLength(0)
  })

  it('still caches normal (non-student-view) exam-mode questions that carry a correct field', async () => {
    vi.stubGlobal('fetch', mockFetch([{ body: { questions: makeQuestions(3) } }]))

    await generateAIQuestions(examConfig)

    const trusted = getTrustedGeneratedQuestions()
    expect(trusted).toHaveLength(3)
  })

  it('practice mode is unaffected — still rejects a question with a missing correct field', async () => {
    const noAnswerKey = makeStudentViewQuestion(0)
    vi.stubGlobal('fetch', mockFetch([{
      body: { questions: [noAnswerKey, ...makeQuestions(4, 1)] },
    }]))

    const result = await generateAIQuestions(baseConfig)

    // Practice mode never sets studentView, so the answer-less question is
    // correctly rejected by structural validation rather than silently passed.
    expect(result.find(q => q.id === noAnswerKey.id)).toBeUndefined()
    expect(result).toHaveLength(4)
  })
})

// ── Hybrid local-bank + AI-fill reservation safety ───────────────────────────

describe('generateAIQuestions - exam-mode hybrid local-bank + AI-fill reservation safety', () => {
  const makeHybridBankQuestion = (i) => ({
    ...makeQuestion(i + 500),
    usmleContentArea: 'Cardiovascular System',
    physicianTask:    'Patient Care: Diagnosis',
    source:           'bank',
  })

  it('requests the full count from the backend instead of the bank shortfall, so one reservation covers the entire session', async () => {
    const bank = [makeHybridBankQuestion(0), makeHybridBankQuestion(1)] // 2 of 3
    getBankQuestionsForConfig.mockReturnValue(bank)
    const bodies = []
    vi.stubGlobal('fetch', vi.fn(async (_url, opts) => {
      bodies.push(JSON.parse(opts.body))
      return { ok: true, json: async () => ({ questions: makeStudentViewQuestions(3), telemetry: { studentView: true, reserved: true } }) }
    }))

    const result = await generateAIQuestions(examConfig, null, 'cs-hybrid-full-count')

    // Full requested count, not the 1-question shortfall the bank-first math
    // would otherwise ask for.
    expect(bodies[0].config.questionCount).toBe(3)
    expect(result).toHaveLength(3)
    // No local-bank id made it into the final set — the submitted session is
    // 100% the server's reserved response, so it can never diverge from it.
    const bankIds = new Set(bank.map(q => q.id))
    expect(result.every(q => !bankIds.has(q.id))).toBe(true)
    expect(result.generationTelemetry.bankUsed).toBe(0)
  })

  it('the returned set has exactly the ids the server reserved — no local-bank splice, no dropped questions', async () => {
    const bank = [makeHybridBankQuestion(0)] // 1 of 3
    getBankQuestionsForConfig.mockReturnValue(bank)
    const serverQuestions = makeStudentViewQuestions(3)
    vi.stubGlobal('fetch', mockFetch([{
      body: { questions: serverQuestions, telemetry: { studentView: true, reserved: true } },
    }]))

    const result = await generateAIQuestions(examConfig, null, 'cs-hybrid-exact-ids')

    expect(result.map(q => q.id).sort()).toEqual(serverQuestions.map(q => q.id).sort())
  })

  it('does not filter a previously-seen id out of a server-reserved exam response, since that would submit fewer ids than were reserved', async () => {
    const seenState = {
      seenIds:          new Set(['fp-0']),
      seenBaseIds:      new Set(['fp-0']),
      seenFingerprints: new Set(),
    }
    vi.stubGlobal('fetch', mockFetch([{
      body: { questions: makeStudentViewQuestions(3), telemetry: { studentView: true, reserved: true } },
    }]))

    const result = await generateAIQuestions(examConfig, seenState, 'cs-hybrid-no-shrink')

    // The backend already reserved this exact 3-question set — filtering fp-0
    // out here would submit only 2 ids against a 3-id reservation, throwing
    // SNAPSHOT_MISMATCH at completion even without any hybrid bank mixing.
    expect(result).toHaveLength(3)
    expect(result.find(q => q.id === 'fp-0')).toBeDefined()
  })

  it('authenticated exam mode routes to the backend even when local bank alone fully covers the request', async () => {
    // The local static bank ships inside the JS bundle with its answer keys —
    // an authenticated, backend-connected Exam session must never be satisfied
    // purely from it, even when the bank has plenty of matching questions.
    const bank = [makeHybridBankQuestion(0), makeHybridBankQuestion(1), makeHybridBankQuestion(2)] // full 3
    getBankQuestionsForConfig.mockReturnValue(bank)
    const bodies = []
    vi.stubGlobal('fetch', vi.fn(async (_url, opts) => {
      bodies.push(JSON.parse(opts.body))
      return {
        ok: true,
        json: async () => ({ questions: makeStudentViewQuestions(3), telemetry: { studentView: true, reserved: true } }),
      }
    }))

    const result = await generateAIQuestions(examConfig, null, 'cs-hybrid-bank-full')

    expect(bodies[0].config.questionCount).toBe(3)
    expect(result).toHaveLength(3)
    const bankIds = new Set(bank.map(q => q.id))
    expect(result.every(q => !bankIds.has(q.id))).toBe(true)
    expect(result.generationTelemetry.bankUsed).toBe(0)
  })

  it('anonymous exam mode still uses local bank alone when it fully covers the request (explicit local fallback)', async () => {
    setAuthSession('anonymous')
    const bank = [makeHybridBankQuestion(0), makeHybridBankQuestion(1), makeHybridBankQuestion(2)] // full 3
    getBankQuestionsForConfig.mockReturnValue(bank)
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const result = await generateAIQuestions(examConfig, null, 'cs-hybrid-bank-full-anon')

    expect(result).toHaveLength(3)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('generateAIQuestions - reported question filtering', () => {
  it('filters reported questions by id before returning a session', async () => {
    const reported = makeQuestion(0)
    saveQuestionReport(reported, 'wrong_answer', { mode: 'practice' })
    vi.stubGlobal('fetch', mockFetch([{ body: { questions: [reported, ...makeQuestions(4, 1)] } }]))

    const result = await generateAIQuestions(baseConfig)

    expect(result).toHaveLength(4)
    expect(result.find(q => q.id === reported.id)).toBeUndefined()
  })

  it('filters reported questions by fingerprint when the server rewrites the id', async () => {
    const original = makeQuestion(0)
    const rewritten = makeQuestion(0, { id: 'new-ai-id' })
    saveQuestionReport(original, 'bad_explanation', { mode: 'practice' })
    vi.stubGlobal('fetch', mockFetch([{ body: { questions: [rewritten, ...makeQuestions(4, 1)] } }]))

    const result = await generateAIQuestions(baseConfig)

    expect(result).toHaveLength(4)
    expect(result.find(q => q.id === rewritten.id)).toBeUndefined()
  })
})

// ── Validator sync: abbreviation allowlist + contradiction phrases ─────────────

describe('generateAIQuestions — validator sync', () => {
  // Reusable HIT fixture: Argatroban correct, 7-char wrong options (Heparin/Aspirin/Digoxin).
  const hitBase = {
    id: 'hit-q-001',
    stem: 'A 58-year-old man with deep vein thrombosis presents with new thrombocytopenia three days after initiating unfractionated heparin. Platelet count has fallen from 285,000 to 43,000/μL. Which anticoagulant is most appropriate for continued therapy?',
    correct: 'A',
    options: [
      { letter: 'A', text: 'Argatroban' },
      { letter: 'B', text: 'Heparin' },
      { letter: 'C', text: 'Aspirin' },
      { letter: 'D', text: 'Digoxin' },
    ],
  }
  // explanation that supports Argatroban (passes support check) — base for contradiction variants
  const argatrobanSupport = 'Argatroban is a direct thrombin inhibitor used when HIT is suspected.'

  // ── Medical abbreviation allowlist ─────────────────────────────────────────

  it('does not reject ATP as correct answer when explanation describes the mechanism without spelling ATP', async () => {
    const atpQuestion = {
      id: 'atp-q-001',
      stem: 'A 28-year-old man presents with exercise intolerance and muscle weakness. Electron microscopy reveals abnormal mitochondria. Biochemical testing shows a defect in Complex V. Which molecule is most directly underproduced?',
      correct: 'A',
      options: [
        { letter: 'A', text: 'ATP' },
        { letter: 'B', text: 'NADH' },
        { letter: 'C', text: 'FADH2' },
        { letter: 'D', text: 'Pyruvate' },
      ],
      explanation: 'A defect in the electron transport chain terminal enzyme reduces energy production in skeletal muscle, explaining the exercise intolerance and weakness seen in mitochondrial myopathy.',
    }
    vi.stubGlobal('fetch', mockFetch([{ body: { questions: [atpQuestion, ...makeQuestions(4, 20)] } }]))
    const result = await generateAIQuestions({ questionCount: 5, mode: 'practice' })
    expect(result).toHaveLength(5)
    expect(result.find(q => q.id === 'atp-q-001')).toBeDefined()
  })

  it('still rejects unknown short answer XYZ when explanation does not support it', async () => {
    const xyzQuestion = {
      id: 'xyz-q-001',
      stem: 'A 30-year-old man presents with a rare metabolic pathway deficiency confirmed on enzyme assay.',
      correct: 'A',
      options: [
        { letter: 'A', text: 'XYZ' },
        { letter: 'B', text: 'Femoral nerve' },
        { letter: 'C', text: 'Sciatic nerve' },
        { letter: 'D', text: 'Tibial nerve' },
      ],
      explanation: 'The common peroneal nerve winds around the fibular neck and is vulnerable to injury from fractures at this site.',
    }
    vi.stubGlobal('fetch', mockFetch([{ body: { questions: [xyzQuestion, ...makeQuestions(4, 20)] } }]))
    const result = await generateAIQuestions({ questionCount: 5, mode: 'practice' })
    expect(result).toHaveLength(4)
    expect(result.find(q => q.id === 'xyz-q-001')).toBeUndefined()
  })

  // ── Contradiction threshold + new phrases ──────────────────────────────────

  it('catches "Heparin is the correct answer" when Heparin is a wrong option (7-char threshold)', async () => {
    const q = { ...hitBase, explanation: `${argatrobanSupport} Heparin is the correct answer for standard DVT, but in HIT argatroban is preferred.` }
    vi.stubGlobal('fetch', mockFetch([{ body: { questions: [q, ...makeQuestions(4, 20)] } }]))
    const result = await generateAIQuestions({ questionCount: 5, mode: 'practice' })
    expect(result).toHaveLength(4)
    expect(result.find(r => r.id === 'hit-q-001')).toBeUndefined()
  })

  it('catches "the best answer is Aspirin" when Aspirin is a wrong option', async () => {
    const q = { ...hitBase, explanation: `${argatrobanSupport} The best answer is aspirin for antiplatelet therapy in coronary artery disease.` }
    vi.stubGlobal('fetch', mockFetch([{ body: { questions: [q, ...makeQuestions(4, 20)] } }]))
    const result = await generateAIQuestions({ questionCount: 5, mode: 'practice' })
    expect(result).toHaveLength(4)
    expect(result.find(r => r.id === 'hit-q-001')).toBeUndefined()
  })

  it('catches "you should choose Digoxin" when Digoxin is a wrong option', async () => {
    const q = { ...hitBase, explanation: `${argatrobanSupport} You should choose digoxin for rate control in atrial fibrillation with heart failure.` }
    vi.stubGlobal('fetch', mockFetch([{ body: { questions: [q, ...makeQuestions(4, 20)] } }]))
    const result = await generateAIQuestions({ questionCount: 5, mode: 'practice' })
    expect(result).toHaveLength(4)
    expect(result.find(r => r.id === 'hit-q-001')).toBeUndefined()
  })

  it('catches "Digoxin should be selected" when Digoxin is a wrong option', async () => {
    const q = { ...hitBase, explanation: `${argatrobanSupport} Digoxin should be selected for rate control in heart failure with reduced ejection fraction.` }
    vi.stubGlobal('fetch', mockFetch([{ body: { questions: [q, ...makeQuestions(4, 20)] } }]))
    const result = await generateAIQuestions({ questionCount: 5, mode: 'practice' })
    expect(result).toHaveLength(4)
    expect(result.find(r => r.id === 'hit-q-001')).toBeUndefined()
  })

  it('does not flag "Heparin is incorrect because..." when Heparin is a wrong option', async () => {
    const q = { ...hitBase, explanation: `${argatrobanSupport} Heparin is incorrect because it triggers the PF4-heparin antibody complex that causes HIT.` }
    vi.stubGlobal('fetch', mockFetch([{ body: { questions: [q, ...makeQuestions(4, 20)] } }]))
    const result = await generateAIQuestions({ questionCount: 5, mode: 'practice' })
    expect(result).toHaveLength(5)
    expect(result.find(r => r.id === 'hit-q-001')).toBeDefined()
  })

  it('does not flag when the endorsed option is the correct answer', async () => {
    const q = { ...hitBase, explanation: 'Argatroban is the correct answer. It is a direct thrombin inhibitor that bypasses the heparin-PF4 antibody mechanism entirely, making it safe in HIT.' }
    vi.stubGlobal('fetch', mockFetch([{ body: { questions: [q, ...makeQuestions(4, 20)] } }]))
    const result = await generateAIQuestions({ questionCount: 5, mode: 'practice' })
    expect(result).toHaveLength(5)
    expect(result.find(r => r.id === 'hit-q-001')).toBeDefined()
  })

  it('skips contradiction and support checks in exam mode', async () => {
    const q = { ...hitBase, explanation: 'You should choose digoxin for this patient. Heparin is the correct answer.' }
    vi.stubGlobal('fetch', mockFetch([{ body: { questions: [q, ...makeQuestions(4, 20)] } }]))
    const result = await generateAIQuestions({ questionCount: 5, mode: 'exam' })
    expect(result).toHaveLength(5)
    expect(result.find(r => r.id === 'hit-q-001')).toBeDefined()
  })
})

// ── USMLE taxonomy preservation ───────────────────────────────────────────────

describe('generateAIQuestions — USMLE taxonomy', () => {
  it('preserves usmleContentArea when backend returns a valid official value', async () => {
    const q = makeQuestion(0, { usmleContentArea: 'Cardiovascular System', system: 'Cardiovascular' })
    vi.stubGlobal('fetch', mockFetch([{ body: { questions: [q, ...makeQuestions(4, 30)] } }]))
    const result = await generateAIQuestions(baseConfig)
    expect(result.find(r => r.id === 'uuid-0').usmleContentArea).toBe('Cardiovascular System')
  })

  it('preserves physicianTask when backend returns a valid official value', async () => {
    const q = makeQuestion(0, { physicianTask: 'Patient Care: Diagnosis' })
    vi.stubGlobal('fetch', mockFetch([{ body: { questions: [q, ...makeQuestions(4, 30)] } }]))
    const result = await generateAIQuestions(baseConfig)
    expect(result.find(r => r.id === 'uuid-0').physicianTask).toBe('Patient Care: Diagnosis')
  })

  it('preserves usmleSubdomain when backend returns it', async () => {
    const q = makeQuestion(0, { usmleSubdomain: 'Heart Failure Pharmacology', usmleContentArea: 'Cardiovascular System' })
    vi.stubGlobal('fetch', mockFetch([{ body: { questions: [q, ...makeQuestions(4, 30)] } }]))
    const result = await generateAIQuestions(baseConfig)
    expect(result.find(r => r.id === 'uuid-0').usmleSubdomain).toBe('Heart Failure Pharmacology')
  })

  it('falls back to inference when backend omits usmleContentArea', async () => {
    const q = makeQuestion(0, { system: 'Renal' })
    vi.stubGlobal('fetch', mockFetch([{ body: { questions: [q, ...makeQuestions(4, 30)] } }]))
    const result = await generateAIQuestions(baseConfig)
    expect(result.find(r => r.id === 'uuid-0').usmleContentArea).toBe('Renal & Urinary System')
  })

  it('falls back to system inference when backend returns an unrecognized usmleContentArea', async () => {
    const q = makeQuestion(0, { usmleContentArea: 'not a valid area', system: 'Cardiovascular' })
    vi.stubGlobal('fetch', mockFetch([{ body: { questions: [q, ...makeQuestions(4, 30)] } }]))
    const result = await generateAIQuestions(baseConfig)
    // 'not a valid area' fails normalisation → falls through to system: 'Cardiovascular'
    expect(result.find(r => r.id === 'uuid-0').usmleContentArea).toBe('Cardiovascular System')
  })

  it('assigns a non-empty usmleContentArea and physicianTask to every question', async () => {
    vi.stubGlobal('fetch', mockFetch([{ body: { questions: makeQuestions(5) } }]))
    const result = await generateAIQuestions(baseConfig)
    expect(result.every(q => q.usmleContentArea && q.usmleContentArea.length > 0)).toBe(true)
    expect(result.every(q => q.physicianTask && q.physicianTask.length > 0)).toBe(true)
  })
})

// ── Phase 9.9 bank-first generation flow ─────────────────────────────────────

// Helper: make bank-style questions (enriched with usmleContentArea so they
// pass through enrichQuestionWithUsmleTaxonomy without losing data).
const makeBankQuestion = (i, overrides = {}) => ({
  ...makeQuestion(i + 200),    // distinct ids from AI questions
  usmleContentArea: 'Cardiovascular System',
  physicianTask:    'Patient Care: Diagnosis',
  source:           'bank',
  ...overrides,
})
const makeBankQuestions = (n, offset = 0) =>
  Array.from({ length: n }, (_, i) => makeBankQuestion(i + offset))

describe('generateAIQuestions — bank-first: no AI call when bank has enough', () => {
  it('does not call fetch when bank has enough Balanced questions', async () => {
    getBankQuestionsForConfig.mockReturnValue(makeBankQuestions(5))
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const result = await generateAIQuestions(baseConfig)
    expect(result).toHaveLength(5)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('allows rare extended option sets from the validated bank path', async () => {
    const extended = makeBankQuestion(99, {
      id: 'bank-extended-five',
      correct: 'E',
      options: [
        { letter: 'A', text: 'Alpha distractor' },
        { letter: 'B', text: 'Beta distractor' },
        { letter: 'C', text: 'Gamma distractor' },
        { letter: 'D', text: 'Delta distractor' },
        { letter: 'E', text: 'Correct fifth mechanism' },
      ],
      explanation: 'Correct fifth mechanism explains the vignette and is the best answer.',
      optionExplanations: {
        A: 'Alpha is incorrect because it does not explain the vignette.',
        B: 'Beta is incorrect because it does not explain the vignette.',
        C: 'Gamma is incorrect because it does not explain the vignette.',
        D: 'Delta is incorrect because it does not explain the vignette.',
        E: 'Correct fifth mechanism is correct because it explains the vignette.',
      },
    })

    expect(validateBankQuestion(extended, { mode: 'coach' })).toHaveLength(0)
  })

  it('rejects a trusted/bank candidate missing the E option explanation in coach mode', async () => {
    const missingE = makeBankQuestion(98, {
      id: 'bank-extended-missing-e-explanation',
      correct: 'E',
      options: [
        { letter: 'A', text: 'Alpha distractor' },
        { letter: 'B', text: 'Beta distractor' },
        { letter: 'C', text: 'Gamma distractor' },
        { letter: 'D', text: 'Delta distractor' },
        { letter: 'E', text: 'Correct fifth mechanism' },
      ],
      explanation: 'Correct fifth mechanism explains the vignette and is the best answer.',
      optionExplanations: {
        A: 'Alpha is incorrect because it does not explain the vignette.',
        B: 'Beta is incorrect because it does not explain the vignette.',
        C: 'Gamma is incorrect because it does not explain the vignette.',
        D: 'Delta is incorrect because it does not explain the vignette.',
        // E intentionally omitted
      },
    })

    expect(validateBankQuestion(missingE, { mode: 'coach' })).toContain('missing_option_explanations')
  })

  it('rejects a bank/trusted candidate with an M option (beyond the A-L ceiling)', async () => {
    const tooMany = makeBankQuestion(97, {
      id: 'bank-extended-m-option',
      correct: 'A',
      options: [
        { letter: 'A', text: 'Correct mechanism' },
        { letter: 'B', text: 'Distractor B' },
        { letter: 'C', text: 'Distractor C' },
        { letter: 'D', text: 'Distractor D' },
        { letter: 'E', text: 'Distractor E' },
        { letter: 'F', text: 'Distractor F' },
        { letter: 'G', text: 'Distractor G' },
        { letter: 'H', text: 'Distractor H' },
        { letter: 'I', text: 'Distractor I' },
        { letter: 'J', text: 'Distractor J' },
        { letter: 'K', text: 'Distractor K' },
        { letter: 'L', text: 'Distractor L' },
        { letter: 'M', text: 'Distractor M - beyond the ceiling' },
      ],
    })

    expect(validateBankQuestion(tooMany, { mode: 'practice' })).toContain('invalid_options')
  })

  it('still rejects extended option sets returned by live AI generation', async () => {
    const extended = makeQuestion(0, {
      correct: 'E',
      options: [
        { letter: 'A', text: 'Alpha distractor' },
        { letter: 'B', text: 'Beta distractor' },
        { letter: 'C', text: 'Gamma distractor' },
        { letter: 'D', text: 'Delta distractor' },
        { letter: 'E', text: 'Correct fifth mechanism' },
      ],
      explanation: 'Correct fifth mechanism explains the unique clinical findings.',
    })

    vi.stubGlobal('fetch', mockFetch([{ body: { questions: [extended, ...makeQuestions(4, 20)] } }]))

    const result = await generateAIQuestions(baseConfig)

    expect(result).toHaveLength(4)
    expect(result.find(q => q.id === 'uuid-0')).toBeUndefined()
  })

  it('migrates the legacy standardized preset to the current 20Q bank-first block (anonymous local fallback)', async () => {
    // Anonymous users have no authenticated backend path at all, so full local
    // bank coverage is still served directly — this test verifies the config
    // migration itself, independent of the authenticated exam-mode server-owned
    // gate exercised separately below.
    setAuthSession('anonymous')
    const config = {
      questionCount: 40,
      mode: 'exam',
      difficulty: 'standardized',
      blockType: STANDARDIZED_40Q_BLOCK,
    }
    getBankQuestionsForConfig.mockReturnValue(makeBankQuestions(20))
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const result = await generateAIQuestions(config)

    expect(result).toHaveLength(20)
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(getBankQuestionsForConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        blockType: STANDARDIZED_STEP1_BLOCK,
        questionCount: 20,
        difficulty: 'Balanced',
      }),
      null,
    )
  })

  it('authenticated Step 1 Standard Block routes to the server-owned path even when local bank fully covers the migrated 20Q request', async () => {
    const config = {
      questionCount: 40,
      mode: 'exam',
      difficulty: 'standardized',
      blockType: STANDARDIZED_40Q_BLOCK,
    }
    getBankQuestionsForConfig.mockReturnValue(makeBankQuestions(20))
    const bodies = []
    vi.stubGlobal('fetch', vi.fn(async (_url, opts) => {
      bodies.push(JSON.parse(opts.body))
      return {
        ok: true,
        json: async () => ({ questions: makeStudentViewQuestions(20), telemetry: { studentView: true, reserved: true } }),
      }
    }))

    const result = await generateAIQuestions(config, null, 'cs-standardized-block-server-owned')

    // Migration to the current 20Q bank-first block happens before routing —
    // the server request reflects the migrated config, not the legacy 40Q one.
    expect(bodies[0].config.blockType).toBe(STANDARDIZED_STEP1_BLOCK)
    expect(bodies[0].config.questionCount).toBe(20)
    expect(result).toHaveLength(20)
    expect(result.generationTelemetry.bankUsed).toBe(0)
  })

  it('does not call fetch when bank has enough NBME Difficult questions (anonymous local fallback)', async () => {
    // Anonymous users have no authenticated backend path — full local bank
    // coverage for hard-mode content is still served directly (see the
    // authenticated counterpart below, which now routes to the backend).
    setAuthSession('anonymous')
    const nbmeConfig = { questionCount: 5, mode: 'exam', difficulty: 'NBME Difficult' }
    getBankQuestionsForConfig.mockReturnValue(
      makeBankQuestions(5, 0).map(q => ({ ...q, difficulty: 'NBME Difficult' })),
    )
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const result = await generateAIQuestions(nbmeConfig)
    expect(result).toHaveLength(5)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('authenticated exam mode routes to the backend for hard-mode difficulty too, even with full local bank coverage', async () => {
    const nbmeConfig = { questionCount: 5, mode: 'exam', difficulty: 'NBME Difficult' }
    getBankQuestionsForConfig.mockReturnValue(
      makeBankQuestions(5, 0).map(q => ({ ...q, difficulty: 'NBME Difficult' })),
    )
    const bodies = []
    vi.stubGlobal('fetch', vi.fn(async (_url, opts) => {
      bodies.push(JSON.parse(opts.body))
      return {
        ok: true,
        json: async () => ({
          questions: makeStudentViewQuestions(5),
          telemetry: { studentView: true, reserved: true },
        }),
      }
    }))

    const result = await generateAIQuestions(nbmeConfig, null, 'cs-hard-mode-server-owned')

    expect(bodies[0].config.questionCount).toBe(5)
    expect(bodies[0].config.difficulty).toBe('NBME Difficult')
    expect(result).toHaveLength(5)
    expect(result.generationTelemetry.bankUsed).toBe(0)
  })

  it('telemetry shows source=validated-local-bank and aiUsed=0 when bank covers all', async () => {
    getBankQuestionsForConfig.mockReturnValue(makeBankQuestions(5))
    vi.stubGlobal('fetch', vi.fn())
    const result = await generateAIQuestions(baseConfig)
    expect(result.generationTelemetry?.source).toBe('validated-local-bank')
    expect(result.generationTelemetry?.bankUsed).toBe(5)
    expect(result.generationTelemetry?.aiUsed).toBe(0)
    expect(result.generationTelemetry?.aiRequested).toBe(0)
  })

  it('allows anonymous users to use a fully covered validated local bank', async () => {
    setAuthSession('anonymous')
    getBankQuestionsForConfig.mockReturnValue(makeBankQuestions(5))
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const result = await generateAIQuestions(baseConfig)

    expect(result).toHaveLength(5)
    expect(result.generationTelemetry?.source).toBe('validated-local-bank')
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('generateAIQuestions — bank-first: partial bank + AI fill', () => {
  it('does not start paid live generation for an anonymous user', async () => {
    setAuthSession('anonymous')
    getBankQuestionsForConfig.mockReturnValue(makeBankQuestions(2))
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    await expect(generateAIQuestions(baseConfig)).rejects.toMatchObject({
      code: 'AUTH_REQUIRED_FOR_LIVE_AI',
      available: 2,
      requested: 5,
    })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('calls AI only for the missing count when bank has partial coverage', async () => {
    getBankQuestionsForConfig.mockReturnValue(makeBankQuestions(2))
    const bodies = []
    vi.stubGlobal('fetch', vi.fn(async (_url, opts) => {
      bodies.push(JSON.parse(opts.body))
      return { ok: true, json: async () => ({ questions: makeQuestions(3, 50) }) }
    }))
    const result = await generateAIQuestions(baseConfig)
    expect(result).toHaveLength(5)
    expect(bodies[0].config.questionCount).toBe(3)
  })

  it('deduplicates bank + AI questions when AI returns a question already in bank', async () => {
    const shared = makeBankQuestion(0)
    getBankQuestionsForConfig.mockReturnValue([shared])
    // AI returns the same stem + concept alongside 4 fresh questions
    vi.stubGlobal('fetch', mockFetch([{ body: { questions: [shared, ...makeQuestions(4, 60)] } }]))
    const result = await generateAIQuestions(baseConfig)
    // shared appears once, plus 4 fresh = 5 total; no duplicate
    expect(result.filter(q => q.id === shared.id)).toHaveLength(1)
    expect(result).toHaveLength(5)
  })

  it('telemetry shows source=bank-plus-ai with correct bankUsed/aiUsed', async () => {
    getBankQuestionsForConfig.mockReturnValue(makeBankQuestions(2))
    vi.stubGlobal('fetch', mockFetch([{ body: { questions: makeQuestions(3, 70) } }]))
    const result = await generateAIQuestions(baseConfig)
    expect(result.generationTelemetry?.source).toBe('bank-plus-ai')
    expect(result.generationTelemetry?.bankUsed).toBe(2)
    expect(result.generationTelemetry?.aiUsed).toBeGreaterThan(0)
    expect(result.generationTelemetry?.aiRequested).toBe(3)
  })

  it('telemetry shows source=live-ai when bank has none', async () => {
    getBankQuestionsForConfig.mockReturnValue([])
    vi.stubGlobal('fetch', mockFetch([{ body: { questions: makeQuestions(5) } }]))
    const result = await generateAIQuestions(baseConfig)
    expect(result.generationTelemetry?.source).toBe('live-ai')
    expect(result.generationTelemetry?.bankUsed).toBe(0)
  })
})

describe('generateAIQuestions — bank-first: AI failure handling', () => {
  it('uses bank questions when AI fails and bank has partial coverage (non-40Q)', async () => {
    getBankQuestionsForConfig.mockReturnValue(makeBankQuestions(3))
    vi.stubGlobal('fetch', mockFetch([{ ok: false, body: { error: 'Service unavailable' } }]))
    const result = await generateAIQuestions(baseConfig)
    // Returns 3 bank questions; partial is accepted for non-40Q
    expect(result).toHaveLength(3)
    expect(result.generationTelemetry?.source).toBe('fallback-bank')
  })

  it('throws AI error when bank has nothing and AI fails', async () => {
    getBankQuestionsForConfig.mockReturnValue([])
    vi.stubGlobal('fetch', mockFetch([{ ok: false, body: { error: 'Service unavailable' } }]))
    await expect(generateAIQuestions(baseConfig)).rejects.toThrow('Service unavailable')
  })

  it('slices the fallback-bank result to the requested count, even when the local pool holds far more', async () => {
    // _checkCount validates count but does not slice — the fallback path must
    // slice itself, or an exam with a small requested count could silently
    // receive the entire scope-matched local pool (e.g. tens of questions)
    // whenever the AI call fails and bank coverage is generous.
    getBankQuestionsForConfig.mockReturnValue(makeBankQuestions(12))
    vi.stubGlobal('fetch', mockFetch([{ ok: false, body: { error: 'Service unavailable' } }]))
    const result = await generateAIQuestions(baseConfig) // baseConfig.questionCount === 5
    expect(result).toHaveLength(5)
    expect(result.generationTelemetry?.bankUsed).toBe(5)
  })

  it('throws AI_INSUFFICIENT_COUNT for 40Q block even when bank has partial questions', async () => {
    const config40Q = { questionCount: 40, mode: 'exam' }
    getBankQuestionsForConfig.mockReturnValue(makeBankQuestions(30))
    vi.stubGlobal('fetch', mockFetch([{ ok: false, body: { error: 'Service unavailable' } }]))
    await expect(generateAIQuestions(config40Q)).rejects.toThrow()
  })

  it('does not fall back to the answer-bearing local bank for an authenticated Exam session, even at a non-40Q count', async () => {
    // examMustUseServer forces this request through the backend regardless of
    // local bank coverage — a backend error here must surface as an error, not
    // silently serve local bank content the way Practice/Coach are allowed to.
    const examConfig = { questionCount: 5, mode: 'exam' }
    setAuthSession('authenticated', 'test-user')
    getBankQuestionsForConfig.mockReturnValue(makeBankQuestions(3))
    vi.stubGlobal('fetch', mockFetch([{ ok: false, body: { error: 'Service unavailable', code: 'AI_INSUFFICIENT_COUNT', returned: 3, requested: 5 } }]))

    await expect(generateAIQuestions(examConfig)).rejects.toMatchObject({ code: 'AI_INSUFFICIENT_COUNT' })
  })
})

describe('generateAIQuestions — bank-first: seen/reported filtering', () => {
  it('seen trusted questions are excluded from bank candidates', async () => {
    const trusted = makeQuestions(3, 80)
    appendTrustedGeneratedQuestions(trusted, baseConfig)

    const seenState = {
      seenIds:          new Set([trusted[0].id, trusted[1].id]),
      seenBaseIds:      new Set([trusted[0].id, trusted[1].id]),
      seenFingerprints: new Set(),
    }
    // bank returns nothing; trusted has 1 unseen → AI called for 4
    vi.stubGlobal('fetch', mockFetch([{ body: { questions: makeQuestions(4, 90) } }]))
    const result = await generateAIQuestions(baseConfig, seenState)

    expect(result.find(q => q.id === trusted[0].id)).toBeUndefined()
    expect(result.find(q => q.id === trusted[1].id)).toBeUndefined()
    expect(result).toHaveLength(5)
  })

  it('reported trusted questions are excluded from bank candidates', async () => {
    const trusted = makeQuestions(5, 100)
    appendTrustedGeneratedQuestions(trusted, baseConfig)
    saveQuestionReport(trusted[0], 'wrong_answer', baseConfig)
    saveQuestionReport(trusted[1], 'bad_explanation', baseConfig)

    // bank returns nothing; 3 trusted unreported → AI called for 2
    vi.stubGlobal('fetch', mockFetch([{ body: { questions: makeQuestions(2, 110) } }]))
    const result = await generateAIQuestions(baseConfig)

    expect(result.find(q => q.id === trusted[0].id)).toBeUndefined()
    expect(result.find(q => q.id === trusted[1].id)).toBeUndefined()
    expect(result).toHaveLength(5)
  })
})

describe('generateAIQuestions — formatGenerationErrorMessage INSUFFICIENT_QUESTIONS', () => {
  it('returns user-friendly message for INSUFFICIENT_QUESTIONS code', () => {
    const err = Object.assign(new Error('Not enough'), { code: 'INSUFFICIENT_QUESTIONS', available: 2, requested: 5 })
    const msg = formatGenerationErrorMessage(err, baseConfig)
    expect(msg).toContain('Broaden your filters')
    expect(msg).toContain('reduce the question count')
  })
})

describe('generateAIQuestions — formatGenerationErrorMessage Exam fail-closed codes', () => {
  const examConfig = { questionCount: 5, mode: 'exam' }

  it('returns a clear message for AI_INSUFFICIENT_COUNT on a Balanced Exam block', () => {
    const err = Object.assign(new Error('short'), { code: 'AI_INSUFFICIENT_COUNT', returned: 3, requested: 5 })
    const msg = formatGenerationErrorMessage(err, examConfig)
    expect(msg).toContain('Not enough validated questions')
    expect(msg).toContain('3')
    expect(msg).toContain('5')
  })

  it('returns a clear message for CLIENT_SESSION_ID_REQUIRED', () => {
    const err = Object.assign(new Error('missing session id'), { code: 'CLIENT_SESSION_ID_REQUIRED' })
    expect(formatGenerationErrorMessage(err, examConfig)).toContain('Could not start a secure Exam session')
  })

  it('returns a clear message for RESERVATION_FAILED', () => {
    const err = Object.assign(new Error('reservation failed'), { code: 'RESERVATION_FAILED' })
    expect(formatGenerationErrorMessage(err, examConfig)).toContain('Could not start a secure Exam session')
  })
})
