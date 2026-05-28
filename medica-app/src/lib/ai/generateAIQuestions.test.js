import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Force VITE_USE_BACKEND_API=true for all tests in this file
vi.stubEnv('VITE_USE_BACKEND_API', 'true')

import { generateAIQuestions } from './generateAIQuestions.js'

const makeQuestion = (i, overrides = {}) => ({
  id:            `uuid-${i}`,            // server-assigned UUID format
  stem:          `A ${30 + i}-year-old patient presents to clinic with a unique complaint number ${i} requiring clinical reasoning.`,
  testedConcept: `Unique Concept ${i}`,
  correct:       'A',
  options:       [{ letter: 'A', text: 'Answer A' }, { letter: 'B', text: 'Answer B' }],
  explanation:   'Explanation text for this unique concept',
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

// ─── Core success path ────────────────────────────────────────────────────────

describe('generateAIQuestions — success path', () => {
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

// ─── Duplicate filtering (no throw) ──────────────────────────────────────────

describe('generateAIQuestions — duplicate filtering', () => {
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

// ─── Server error handling ────────────────────────────────────────────────────

describe('generateAIQuestions — server errors', () => {
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
})

// ─── 40Q Block strict enforcement ────────────────────────────────────────────

describe('generateAIQuestions — 40Q Block enforcement', () => {
  const config40Q = { questionCount: 40, mode: 'exam' }

  it('throws AI_INSUFFICIENT_COUNT when 40Q block gets fewer than 40 questions', async () => {
    vi.stubGlobal('fetch', mockFetch([{ body: { questions: makeQuestions(35) } }]))
    await expect(generateAIQuestions(config40Q))
      .rejects.toMatchObject({ code: 'AI_INSUFFICIENT_COUNT', returned: 35, requested: 40 })
  })

  it('throws with descriptive message naming the shortfall', async () => {
    vi.stubGlobal('fetch', mockFetch([{ body: { questions: makeQuestions(35) } }]))
    await expect(generateAIQuestions(config40Q))
      .rejects.toThrow('40 Question Block requires exactly 40 questions — AI returned 35')
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

// ─── BACKEND_DISABLED short-circuit ──────────────────────────────────────────

describe('generateAIQuestions — BACKEND_DISABLED', () => {
  it('throws BACKEND_DISABLED when env var is not true', async () => {
    vi.stubEnv('VITE_USE_BACKEND_API', 'false')
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    await expect(generateAIQuestions(baseConfig))
      .rejects.toMatchObject({ code: 'BACKEND_DISABLED' })
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
