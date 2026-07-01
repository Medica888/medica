import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  SESSION_SYNC_OUTBOX_LIMITS,
  classifySessionSyncError,
  drainSessionSyncOutbox,
  enqueueSessionSync,
  enqueueQuestionReportSync,
  enqueueFlashcardBatchSync,
  getSessionSyncOutbox,
  getSessionSyncSummary,
} from './sessionSyncOutbox.js'

const USER_A = 'user-a'
const USER_B = 'user-b'

function payload(id = crypto.randomUUID()) {
  return {
    clientSessionId: id,
    mode: 'exam',
    questions: [],
    answers: {},
  }
}

beforeEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('session sync outbox', () => {
  it('persists a user-scoped session operation', async () => {
    const queued = await enqueueSessionSync(payload('11111111-1111-4111-a111-111111111111'), USER_A, new Error('offline'), 1_000)

    expect(queued?.status).toBe('pending')
    expect(getSessionSyncOutbox(USER_A, 1_000)).toHaveLength(1)
    expect(getSessionSyncOutbox(USER_B, 1_000)).toHaveLength(0)
  })

  it('drains a queued operation and removes it after confirmed success', async () => {
    const item = payload('22222222-2222-4222-a222-222222222222')
    enqueueSessionSync(item, USER_A, new Error('offline'), 1_000)
    const createSession = vi.fn().mockResolvedValue({ id: item.clientSessionId })

    const result = await drainSessionSyncOutbox(USER_A, { createSession, force: true, now: 2_000 })

    expect(createSession).toHaveBeenCalledWith(item)
    expect(result.synced).toBe(1)
    expect(getSessionSyncSummary(USER_A, 2_000).total).toBe(0)
  })

  it('keeps retryable failures pending with bounded backoff metadata', async () => {
    enqueueSessionSync(payload(), USER_A, new Error('offline'), 1_000)
    const createSession = vi.fn().mockRejectedValue(Object.assign(new Error('busy'), { status: 503 }))

    const result = await drainSessionSyncOutbox(USER_A, { createSession, force: true, now: 2_000, random: () => 0.5 })
    const [entry] = getSessionSyncOutbox(USER_A, 2_000)

    expect(result.pending).toBe(1)
    expect(entry.attemptCount).toBe(2)
    expect(entry.nextAttemptAt).toBeGreaterThan(2_000)
  })

  it('pauses the queue on 401 without deleting the operation', async () => {
    enqueueSessionSync(payload(), USER_A, new Error('offline'), 1_000)
    const unauthorized = Object.assign(new Error('expired'), { status: 401 })

    const result = await drainSessionSyncOutbox(USER_A, {
      createSession: vi.fn().mockRejectedValue(unauthorized),
      force: true,
      now: 2_000,
    })

    expect(result.paused).toBe(true)
    expect(result.pending).toBe(1)
  })

  it('marks non-retryable 4xx writes as failed', async () => {
    enqueueSessionSync(payload(), USER_A, new Error('offline'), 1_000)
    const invalid = Object.assign(new Error('invalid'), { status: 400 })

    const result = await drainSessionSyncOutbox(USER_A, {
      createSession: vi.fn().mockRejectedValue(invalid),
      force: true,
      now: 2_000,
    })

    expect(result.failed).toBe(1)
    expect(getSessionSyncOutbox(USER_A, 2_000)[0].status).toBe('failed')
  })

  it('does not drain while offline and succeeds after reconnect', async () => {
    enqueueSessionSync(payload(), USER_A, new Error('offline'), 1_000)
    const createSession = vi.fn().mockResolvedValue({})

    const offline = await drainSessionSyncOutbox(USER_A, { createSession, online: false, force: true, now: 2_000 })
    const online = await drainSessionSyncOutbox(USER_A, { createSession, online: true, force: true, now: 3_000 })

    expect(offline.pending).toBe(1)
    expect(createSession).toHaveBeenCalledOnce()
    expect(online.synced).toBe(1)
  })

  it('deduplicates repeated enqueue operations by idempotency key', () => {
    const item = payload('33333333-3333-4333-a333-333333333333')
    enqueueSessionSync(item, USER_A, new Error('first'), 1_000)
    enqueueSessionSync(item, USER_A, new Error('second'), 2_000)

    expect(getSessionSyncOutbox(USER_A, 2_000)).toHaveLength(1)
  })

  it('enforces queue capacity without dropping older pending sessions', async () => {
    for (let index = 0; index < SESSION_SYNC_OUTBOX_LIMITS.maxEntries; index += 1) {
      expect(await enqueueSessionSync(payload(crypto.randomUUID()), USER_A, new Error('offline'), 1_000 + index)).not.toBeNull()
    }

    expect(await enqueueSessionSync(payload(), USER_A, new Error('offline'), 9_000)).toBeNull()
    expect(getSessionSyncOutbox(USER_A, 9_000)).toHaveLength(SESSION_SYNC_OUTBOX_LIMITS.maxEntries)
  })

  it('purges entries older than the maximum age', () => {
    enqueueSessionSync(payload(), USER_A, new Error('offline'), 1_000)
    const expiredAt = 1_000 + SESSION_SYNC_OUTBOX_LIMITS.maxAgeMs + 1

    expect(getSessionSyncOutbox(USER_A, expiredAt)).toHaveLength(0)
  })

  it('classifies network, auth, validation, and server failures', () => {
    expect(classifySessionSyncError(new Error('offline'))).toBe('retryable')
    expect(classifySessionSyncError({ status: 401 })).toBe('paused')
    expect(classifySessionSyncError({ status: 400 })).toBe('permanent')
    expect(classifySessionSyncError({ status: 429 })).toBe('retryable')
    expect(classifySessionSyncError({ status: 503 })).toBe('retryable')
  })
})

describe('question-report outbox', () => {
  const reportPayload = (id = crypto.randomUUID()) => ({
    clientReportId: id,
    fingerprint: 'fp-abc',
    reason: 'incorrect',
    questionId: 'q-1',
  })

  it('enqueues a question-report and scopes it to the user', async () => {
    const id = crypto.randomUUID()
    const queued = await enqueueQuestionReportSync(reportPayload(id), id, USER_A, null, 1_000)
    expect(queued?.operationType).toBe('question-report')
    expect(getSessionSyncOutbox(USER_A, 1_000)).toHaveLength(1)
    expect(getSessionSyncOutbox(USER_B, 1_000)).toHaveLength(0)
  })

  it('drains and delivers the report via apiCalls map', async () => {
    const id = crypto.randomUUID()
    const rpt = reportPayload(id)
    enqueueQuestionReportSync(rpt, id, USER_A, null, 1_000)
    const createReport = vi.fn().mockResolvedValue({ id })

    const result = await drainSessionSyncOutbox(USER_A, {
      apiCalls: { 'question-report': createReport },
      force: true,
      now: 2_000,
    })

    expect(createReport).toHaveBeenCalledWith(rpt)
    expect(result.synced).toBe(1)
    expect(getSessionSyncSummary(USER_A, 2_000).total).toBe(0)
  })

  it('returns null if userId is missing', async () => {
    expect(await enqueueQuestionReportSync(reportPayload(), crypto.randomUUID(), '', null)).toBeNull()
  })

  it('returns null if idempotencyKey is missing', async () => {
    expect(await enqueueQuestionReportSync(reportPayload(), '', USER_A, null)).toBeNull()
  })

  it('deduplicates by idempotency key', () => {
    const id = crypto.randomUUID()
    enqueueQuestionReportSync(reportPayload(id), id, USER_A, null, 1_000)
    enqueueQuestionReportSync(reportPayload(id), id, USER_A, null, 2_000)
    expect(getSessionSyncOutbox(USER_A, 2_000)).toHaveLength(1)
  })
})

describe('flashcard-batch outbox', () => {
  const cards = () => [{ source_question_id: 'q-1', tag: 'Recall', front: 'Q', back: 'A' }]

  it('enqueues a flashcard-batch scoped to the user', async () => {
    const batchId = crypto.randomUUID()
    const queued = await enqueueFlashcardBatchSync(cards(), batchId, USER_A, null, 1_000)
    expect(queued?.operationType).toBe('flashcard-batch')
    expect(getSessionSyncOutbox(USER_A, 1_000)).toHaveLength(1)
  })

  it('drains and delivers cards via apiCalls map', async () => {
    const batchId = crypto.randomUUID()
    const batch = cards()
    enqueueFlashcardBatchSync(batch, batchId, USER_A, null, 1_000)
    const createMany = vi.fn().mockResolvedValue({ flashcards: [] })

    const result = await drainSessionSyncOutbox(USER_A, {
      apiCalls: { 'flashcard-batch': createMany },
      force: true,
      now: 2_000,
    })

    expect(createMany).toHaveBeenCalledWith(batch)
    expect(result.synced).toBe(1)
  })

  it('returns null for empty cards array', async () => {
    expect(await enqueueFlashcardBatchSync([], crypto.randomUUID(), USER_A, null)).toBeNull()
  })

  it('marks batch failed after permanent 4xx', async () => {
    const batchId = crypto.randomUUID()
    enqueueFlashcardBatchSync(cards(), batchId, USER_A, null, 1_000)

    await drainSessionSyncOutbox(USER_A, {
      apiCalls: { 'flashcard-batch': vi.fn().mockRejectedValue(Object.assign(new Error('bad'), { status: 400 })) },
      force: true,
      now: 2_000,
    })

    expect(getSessionSyncOutbox(USER_A, 2_000)[0].status).toBe('failed')
  })
})

describe('outbox concurrency safety', () => {
  it('preserves entries enqueued during an active drain', async () => {
    const first = payload('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa')
    enqueueSessionSync(first, USER_A, null, 1_000)

    // The handler resolves but also enqueues a second entry before the drain writes back,
    // simulating a concurrent enqueue that arrives during the await.
    const second = payload('bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb')
    const createSession = vi.fn().mockImplementation(() => {
      enqueueSessionSync(second, USER_A, null, 2_000)
      return Promise.resolve({})
    })

    const result = await drainSessionSyncOutbox(USER_A, { createSession, force: true, now: 2_000 })

    // First entry synced; second entry (added mid-drain) must survive.
    expect(result.synced).toBe(1)
    const remaining = getSessionSyncOutbox(USER_A, 2_000)
    expect(remaining).toHaveLength(1)
    expect(remaining[0].idempotencyKey).toBe(second.clientSessionId)
  })

  it('reports failed as newly-failed-this-pass, not total failed count', async () => {
    // Pre-existing failed entry
    enqueueSessionSync(payload('cccccccc-cccc-4ccc-cccc-cccccccccccc'), USER_A, null, 1_000)
    const invalid = Object.assign(new Error('bad'), { status: 400 })
    await drainSessionSyncOutbox(USER_A, {
      createSession: vi.fn().mockRejectedValue(invalid),
      force: true,
      now: 2_000,
    })
    // Now drain again with a new entry that also fails — result.failed must be 1 (new), not 2 (total)
    enqueueSessionSync(payload('dddddddd-dddd-4ddd-dddd-dddddddddddd'), USER_A, null, 3_000)
    const result = await drainSessionSyncOutbox(USER_A, {
      createSession: vi.fn().mockRejectedValue(invalid),
      force: true,
      now: 4_000,
    })
    expect(result.failed).toBe(1)
    expect(getSessionSyncSummary(USER_A, 4_000).failed).toBe(2)
  })
})

describe('per-type capacity limits', () => {
  it('question-report queue is full at 20; 21st returns null, session queue unaffected', async () => {
    const limit = SESSION_SYNC_OUTBOX_LIMITS.maxEntriesPerType['question-report']
    for (let i = 0; i < limit; i++) {
      const id = crypto.randomUUID()
      const queued = await enqueueQuestionReportSync({ clientReportId: id }, id, USER_A, null, 1_000 + i)
      expect(queued).not.toBeNull()
    }
    const overflow = crypto.randomUUID()
    expect(await enqueueQuestionReportSync({ clientReportId: overflow }, overflow, USER_A, null, 9_000)).toBeNull()

    // Session queue must be unaffected
    const sessionId = crypto.randomUUID()
    const sess = await enqueueSessionSync(
      { clientSessionId: sessionId, mode: 'exam', questions: [], answers: {} },
      USER_A, null, 9_000,
    )
    expect(sess).not.toBeNull()
  })

  it('flashcard-batch queue is full at 20; 21st returns null, session queue unaffected', async () => {
    const limit = SESSION_SYNC_OUTBOX_LIMITS.maxEntriesPerType['flashcard-batch']
    for (let i = 0; i < limit; i++) {
      const id = crypto.randomUUID()
      const queued = await enqueueFlashcardBatchSync([{ tag: 'Recall' }], id, USER_A, null, 1_000 + i)
      expect(queued).not.toBeNull()
    }
    const overflow = crypto.randomUUID()
    expect(await enqueueFlashcardBatchSync([{ tag: 'Recall' }], overflow, USER_A, null, 9_000)).toBeNull()

    // Session queue must be unaffected
    const sessionId = crypto.randomUUID()
    const sess = await enqueueSessionSync(
      { clientSessionId: sessionId, mode: 'exam', questions: [], answers: {} },
      USER_A, null, 9_000,
    )
    expect(sess).not.toBeNull()
  })

  it('exam-session queue is full at 20; 21st returns null', async () => {
    const limit = SESSION_SYNC_OUTBOX_LIMITS.maxEntriesPerType['exam-session']
    for (let i = 0; i < limit; i++) {
      const id = crypto.randomUUID()
      const sess = await enqueueSessionSync(
        { clientSessionId: id, mode: 'exam', questions: [], answers: {} },
        USER_A, null, 1_000 + i,
      )
      expect(sess).not.toBeNull()
    }
    const overflow = crypto.randomUUID()
    expect(
      await enqueueSessionSync(
        { clientSessionId: overflow, mode: 'exam', questions: [], answers: {} },
        USER_A, null, 9_000,
      ),
    ).toBeNull()
  })
})

describe('drain finalization locking', () => {
  it('preserves entry enqueued during drain finalization (lock contention simulation)', async () => {
    const first = payload('eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee')
    await enqueueSessionSync(first, USER_A, null, 1_000)

    // The handler resolves, then we enqueue a second entry before the drain finalizes.
    // This simulates a concurrent _enqueue arriving after network calls complete.
    const second = payload('ffffffff-ffff-4fff-ffff-ffffffffffff')
    let finalizationStarted = false
    const createSession = vi.fn().mockImplementation(async () => {
      if (!finalizationStarted) {
        finalizationStarted = true
        // Enqueue during the gap between network call and finalization.
        await enqueueSessionSync(second, USER_A, null, 2_000)
      }
      return {}
    })

    const result = await drainSessionSyncOutbox(USER_A, { createSession, force: true, now: 2_000 })

    expect(result.synced).toBe(1)
    const remaining = getSessionSyncOutbox(USER_A, 2_000)
    expect(remaining).toHaveLength(1)
    expect(remaining[0].idempotencyKey).toBe(second.clientSessionId)
  })

  it('concurrent drains deduplicate via activeDrains — both callers share one result', async () => {
    // Two entries; two concurrent drains for the same user share one promise via activeDrains.
    const p1 = payload('11111111-1111-4111-b111-111111111111')
    const p2 = payload('22222222-2222-4222-b222-222222222222')
    await enqueueSessionSync(p1, USER_A, null, 1_000)
    await enqueueSessionSync(p2, USER_A, null, 1_001)

    const createSession = vi.fn().mockResolvedValue({})
    // Run both drains concurrently — the second call returns the SAME promise.
    const [r1, r2] = await Promise.all([
      drainSessionSyncOutbox(USER_A, { createSession, force: true, now: 2_000 }),
      drainSessionSyncOutbox(USER_A, { createSession, force: true, now: 2_001 }),
    ])

    // activeDrains causes r2 to be the same result object as r1.
    expect(r1).toBe(r2)
    expect(r1.synced).toBe(2)
    expect(getSessionSyncSummary(USER_A, 2_001).total).toBe(0)
  })
})

describe('mixed-type outbox', () => {
  it('drains all three operation types in a single pass', async () => {
    const sessionPayload = { clientSessionId: crypto.randomUUID(), mode: 'exam', questions: [], answers: {} }
    const reportId = crypto.randomUUID()
    const batchId = crypto.randomUUID()

    enqueueSessionSync(sessionPayload, USER_A, null, 1_000)
    enqueueQuestionReportSync({ clientReportId: reportId }, reportId, USER_A, null, 1_000)
    enqueueFlashcardBatchSync([{ tag: 'Recall' }], batchId, USER_A, null, 1_000)

    const createSession = vi.fn().mockResolvedValue({})
    const createReport  = vi.fn().mockResolvedValue({})
    const createMany    = vi.fn().mockResolvedValue({ flashcards: [] })

    const result = await drainSessionSyncOutbox(USER_A, {
      apiCalls: {
        'exam-session':    createSession,
        'question-report': createReport,
        'flashcard-batch': createMany,
      },
      force: true,
      now: 2_000,
    })

    expect(result.synced).toBe(3)
    expect(createSession).toHaveBeenCalledOnce()
    expect(createReport).toHaveBeenCalledOnce()
    expect(createMany).toHaveBeenCalledOnce()
    expect(getSessionSyncSummary(USER_A, 2_000).total).toBe(0)
  })
})
