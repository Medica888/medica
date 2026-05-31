import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Force VITE_USE_BACKEND_API=true for all tests in this file
vi.stubEnv('VITE_USE_BACKEND_API', 'true')

import { generateAIQuestions } from './generateAIQuestions.js'

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

beforeEach(() => { vi.stubEnv('VITE_USE_BACKEND_API', 'true') })
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

// Core success path

describe('generateAIQuestions - success path', () => {
  it('returns questions when server returns sufficient unique questions', async () => {
    vi.stubGlobal('fetch', mockFetch([{ body: { questions: makeQuestions(5) } }]))
    const result = await generateAIQuestions(baseConfig)
    expect(result).toHaveLength(5)
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
