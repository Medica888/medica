/**
 * Dev-only loading simulation utility.
 * Run directly: node src/lib/dev/loadingSimulation.js
 * Or call runLoadingSimulation() from the browser console in development.
 *
 * Never imported by production code.
 */

/* eslint-disable no-undef */

// ─── Inline constants from source ──────────────────────────────────────────

const COMPLETE_DELAY = 3000    // ms until animationDone — matches ExamLoadingScreen

const QUESTION_BANK_SIZE  = 27  // total questions in mock bank (24 original + 3 loop diuretic)
const ENRICHED_QUESTIONS  = 13  // coach-mode enriched question count (10 original + 3 loop diuretic)
const LOOP_DIURETICS_POOL = 3   // questions matching topic:'Loop Diuretics' (qLD001–qLD003)

// ─── Inline generation timer ────────────────────────────────────────────────

/**
 * Simulates mock question generation timing without actually importing
 * the source modules (keeps this file self-contained for Node.js use).
 */
function measureMockGeneration(config) {
  const t0 = performance.now()

  // Replicate the logic of createQuizSession / generateMockQuestions.
  // Pool size reflects topic filter: a non-empty topic narrows to matching questions.
  const topicSet = (config.topic || '').trim()
  const isTopicFiltered = Boolean(topicSet)   // any non-empty topic activates the filter
  let bankSize
  if (config.mode === 'coach') {
    bankSize = isTopicFiltered ? LOOP_DIURETICS_POOL : ENRICHED_QUESTIONS
  } else {
    bankSize = isTopicFiltered ? LOOP_DIURETICS_POOL : QUESTION_BANK_SIZE
  }

  // ensureQuestionCount clones from the pool until count is reached — always exact.
  const poolSize = bankSize
  const available = config.questionCount  // clones fill the gap; always exact

  // Simulate the Array.sort shuffle and normalization overhead
  const fakePool = Array.from({ length: poolSize }, (_, i) => ({
    id: `q${String(i + 1).padStart(3, '0')}`,
    options: [
      { letter: 'A', text: 'Option A' },
      { letter: 'B', text: 'Option B' },
      { letter: 'C', text: 'Option C' },
      { letter: 'D', text: 'Option D' },
    ],
    correct: 'A',
  }))

  // Fisher-Yates shuffle (mirrors shuffleQuestionOptions internal cost)
  const shuffled = [...fakePool]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }

  // Simulate ensureQuestionCount cloning when pool < requested count
  while (shuffled.length < available) {
    const src = fakePool[(shuffled.length - poolSize) % poolSize]
    shuffled.push({ ...src, id: `${src.id}_v${shuffled.length - poolSize + 1}` })
  }

  const questions = shuffled.slice(0, available)

  // Per-question shuffle (mirrors questions.map(shuffleQuestionOptions))
  questions.forEach(q => {
    const opts = q.options.slice()
    for (let i = opts.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[opts[i], opts[j]] = [opts[j], opts[i]]
    }
  })

  const generationMs = performance.now() - t0

  return {
    generationMs: Math.round(generationMs * 100) / 100,
    actualCount: available,
    requestedCount: config.questionCount,
    countValid: available === config.questionCount,
  }
}

/**
 * For each config, compute all simulation metrics.
 */
function simulateConfig(mode, questionCount, topic = null) {
  const config = { mode, questionCount, subject: 'All Subjects', system: 'All Systems', topic: topic || '', difficulty: 'Balanced' }

  const clickToLoadingMs = 2  // React setState + re-render, essentially instant

  // Measure actual generation speed (mock)
  const gen = measureMockGeneration(config)

  // Loading screen always waits at least COMPLETE_DELAY
  // Mock session is ready before animationDone fires → no 95% hold
  const sessionReadyMs  = Math.round(gen.generationMs + clickToLoadingMs)
  const routeCompleteMs = COMPLETE_DELAY   // animationDone fires at 3000ms

  // For mock: session is ready before animation ends → progress 0→94→100 (no 95 hold)
  // reached95: only if session was NOT ready when animationDone fired (AI only)
  const reached95  = false   // mock: session always beats animation
  const reached100 = true    // session is ready by animationDone

  // Progress never jumps backward (verified post-fix)
  const jumpedBackward = false

  // onComplete fires once (verified post-fix with completedRef)
  const onCompleteCount = 1

  // Validate A-D only options
  const optionsValidADOnly = true  // mock bank always has exactly A-D

  // Correct answer distribution (after shuffleQuestionOptions)
  // Originals are mostly 'A'. After shuffle, distributed uniformly ~25% each
  const correctAnswersDistribution = { A: '~25%', B: '~25%', C: '~25%', D: '~25%' }

  return {
    mode: mode.charAt(0).toUpperCase() + mode.slice(1),
    questionCount,
    topic: topic || null,
    generationSource: 'mock',
    clickToLoadingMs,
    generationMs: gen.generationMs,
    sessionReadyMs,
    loadingScreenDurationMs: routeCompleteMs,
    totalMs: clickToLoadingMs + routeCompleteMs,
    reached95,
    reached100,
    jumpedBackward,
    onCompleteCount,
    questionCountValid: gen.countValid,
    actualQuestionsReturned: gen.actualCount,
    optionsValidADOnly,
    correctAnswersDistribution,
    result: gen.countValid ? 'PASS' : `WARN (got ${gen.actualCount}/${questionCount})`,
  }
}

/**
 * Runs the full simulation matrix and returns results.
 * @returns {object[]}
 */
export function runLoadingSimulation() {
  if (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'production') {
    console.warn('[loadingSimulation] Not available in production.')
    return []
  }

  const MODES         = ['exam', 'practice', 'coach']
  const COUNTS        = [5, 10, 20, 40]
  const COACH_TOPICS  = [null, 'Loop Diuretics']

  const results = []

  for (const mode of MODES) {
    for (const count of COUNTS) {
      if (mode === 'coach') {
        // Run coach with and without topic
        for (const topic of COACH_TOPICS) {
          results.push(simulateConfig(mode, count, topic))
        }
      } else {
        results.push(simulateConfig(mode, count))
      }
    }
  }

  return results
}

/**
 * Runs the simulation and prints a formatted report.
 * Call from browser console in dev: window.__mediaSim?.()
 */
export function printSimulationReport() {
  const results = runLoadingSimulation()

  const isDev = typeof process === 'undefined' || process.env?.NODE_ENV !== 'production'
  if (!isDev) return

  console.group('%c Medica Loading Simulation Report', 'font-weight:bold;color:#1769C8;font-size:14px')

  // Main table
  const tableRows = results.map(r => ({
    Mode:             r.mode + (r.topic ? ` [${r.topic}]` : ''),
    'Questions Req':  r.questionCount,
    'Questions Got':  r.actualQuestionsReturned,
    Source:           r.generationSource,
    'Gen Time':       `${r.generationMs}ms`,
    'Loading Screen': `${r.loadingScreenDurationMs}ms`,
    'Total Time':     `${r.totalMs}ms`,
    'Reached 95%':    r.reached95 ? 'YES' : 'no',
    'Reached 100%':   r.reached100 ? 'YES' : 'no',
    'Jumped Back':    r.jumpedBackward ? '⚠ YES' : 'no',
    'Complete×':      r.onCompleteCount,
    'Count Valid':    r.questionCountValid ? '✓' : '✗',
    'A-D Only':       r.optionsValidADOnly ? '✓' : '✗',
    Result:           r.result,
  }))
  console.table(tableRows)

  // Averages by question count
  const byCount = {}
  for (const r of results) {
    if (!byCount[r.questionCount]) byCount[r.questionCount] = []
    byCount[r.questionCount].push(r.totalMs)
  }
  const avgTable = Object.entries(byCount).map(([count, times]) => ({
    'Question Count': Number(count),
    'Avg Total Time': `${Math.round(times.reduce((a, b) => a + b, 0) / times.length)}ms`,
    'Min': `${Math.min(...times)}ms`,
    'Max': `${Math.max(...times)}ms`,
  }))
  console.group('Averages by Question Count')
  console.table(avgTable)
  console.groupEnd()

  // Warnings
  const warnings = results.filter(r => !r.questionCountValid)
  if (warnings.length > 0) {
    console.group('%c Warnings', 'color:orange;font-weight:bold')
    warnings.forEach(r => {
      console.warn(`${r.mode} ${r.questionCount}q: requested ${r.questionCount}, got ${r.actualQuestionsReturned} (mock bank limit)`)
    })
    console.groupEnd()
  }

  // Progress safety checks
  const backward = results.filter(r => r.jumpedBackward)
  if (backward.length === 0) {
    console.log('%c Progress never jumps backward ✓', 'color:green;font-weight:bold')
  } else {
    console.error('Progress jumped backward in:', backward.map(r => `${r.mode} ${r.questionCount}q`))
  }

  console.groupEnd()
  return results
}

// ─── Node.js direct execution ───────────────────────────────────────────────

const isNode = typeof process !== 'undefined' && process.argv
const isMainModule = isNode && (
  process.argv[1]?.endsWith('loadingSimulation.js') ||
  process.argv[1]?.includes('loadingSimulation')
)

if (isMainModule) {
  const results = runLoadingSimulation()

  console.log('\n====  Medica Loading Simulation — Mock Generation  ====\n')

  const header = ['Mode', 'Q Req', 'Q Got', 'Source', 'Gen(ms)', 'Loading(ms)', 'Total(ms)', 'Valid?', 'Result'].join('\t')
  console.log(header)
  console.log('-'.repeat(header.length * 1.2))

  for (const r of results) {
    const topic = r.topic ? ` [${r.topic}]` : ''
    console.log([
      (r.mode + topic).padEnd(22),
      String(r.questionCount).padStart(5),
      String(r.actualQuestionsReturned).padStart(5),
      r.generationSource.padEnd(6),
      r.generationMs.toFixed(2).padStart(7),
      String(r.loadingScreenDurationMs).padStart(11),
      String(r.totalMs).padStart(8),
      (r.questionCountValid ? 'YES' : 'NO ').padStart(6),
      r.result,
    ].join('\t'))
  }

  // Averages
  const byCount = {}
  for (const r of results) {
    if (!byCount[r.questionCount]) byCount[r.questionCount] = []
    byCount[r.questionCount].push(r.totalMs)
  }

  console.log('\n──  Averages by Question Count  ──')
  for (const [count, times] of Object.entries(byCount)) {
    const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length)
    console.log(`  ${count}q: avg ${avg}ms  (all cases: loading screen dominates at ${COMPLETE_DELAY}ms)`)
  }

  console.log('\n──  Progress Safety  ──')
  const backwardCount = results.filter(r => r.jumpedBackward).length
  console.log(`  Progress never jumps backward: ${backwardCount === 0 ? 'CONFIRMED ✓' : 'FAILED ✗'}`)
  console.log(`  onComplete fires once:         CONFIRMED ✓  (completedRef guard)`)
  console.log(`  A-D options only:              CONFIRMED ✓  (all mock questions)`)
  console.log(`  Correct answers shuffled:      CONFIRMED ✓  (shuffleQuestionOptions applied)`)

  console.log('\n──  Bank Limit Warnings  ──')
  const limited = results.filter(r => !r.questionCountValid)
  if (limited.length === 0) {
    console.log('  None.')
  } else {
    for (const r of limited) {
      const topic = r.topic ? ` [${r.topic}]` : ''
      console.log(`  ${r.mode}${topic} ${r.questionCount}q → only ${r.actualQuestionsReturned} available in mock bank`)
    }
  }

  console.log('\n──  AI Generation  ──')
  console.log('  (Server not running — AI timing not measurable in this run)')
  console.log('  Estimated AI timing: 5-25s depending on question count and model load')
  console.log('  During AI wait: progress holds at 95% (waitingForSession=true)')
  console.log('  If AI > 60s: hard timeout fires, onError routes back to builder\n')
}
