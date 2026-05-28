// Levenshtein distance (iterative, O(mn))
function levenshtein(a, b) {
  const m = a.length, n = b.length
  const dp = Array.from({ length: m + 1 }, (_, i) => [i])
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  return dp[m][n]
}

function _fuzzyThreshold(len) {
  if (len < 6)  return 0
  if (len <= 8)  return 1
  if (len <= 12) return 2
  return 3
}

function _normStr(s) {
  return s.trim().toLowerCase().replace(/[^a-z0-9 ]/g, '')
}

// Discipline entries: shortAliases = exact single-word abbreviations (no fuzzy),
// fullNames = full spellings + known misspellings (fuzzy against all of them)
const DISCIPLINE_MAP = [
  {
    canonical: 'Neurology',
    shortAliases: ['neuro'],
    fullNames: ['neurology', 'neurlogy', 'nuerology', 'neurologie', 'neorology', 'neurolgy'],
  },
  {
    canonical: 'Psychiatry',
    shortAliases: ['psych', 'psyc'],
    fullNames: ['psychiatry', 'psuciatry', 'phyciatry', 'psiciatry', 'psyciatry', 'phsychiatry', 'psychiatrie', 'psichiatry'],
  },
  {
    canonical: 'Cardiology',
    shortAliases: ['cardio'],
    fullNames: ['cardiology', 'cardiologie', 'cardiologu', 'cardiolgy'],
  },
  {
    canonical: 'Nephrology',
    shortAliases: ['renal', 'nephro'],
    fullNames: ['nephrology', 'nephrologie', 'nephrolgy', 'neprology'],
  },
  {
    canonical: 'Immunology',
    shortAliases: ['immuno'],
    fullNames: ['immunology', 'immunologie', 'immunolgy', 'imunology'],
  },
  {
    canonical: 'Pharmacology',
    shortAliases: ['pharm'],
    fullNames: ['pharmacology', 'pharmocology', 'pharmacologie', 'pharmacolgy', 'farmacology'],
  },
  {
    canonical: 'Biochemistry',
    shortAliases: ['biochem'],
    fullNames: ['biochemistry', 'biochemestry', 'biochemsitry', 'biochimistry'],
  },
  {
    canonical: 'Microbiology',
    shortAliases: ['micro'],
    fullNames: ['microbiology', 'microbilogy', 'microbiologie', 'microbiolgoy'],
  },
  {
    canonical: 'Pathology',
    shortAliases: ['path'],
    fullNames: ['pathology', 'pathologie', 'patholgy', 'patholegy'],
  },
  {
    canonical: 'Physiology',
    shortAliases: ['physio'],
    fullNames: ['physiology', 'phisiology', 'physiologie', 'physiolgoy', 'phyiology'],
  },
  {
    canonical: 'Anatomy',
    shortAliases: ['anat'],
    fullNames: ['anatomy', 'anatomie', 'anatomi', 'anatmy'],
  },
  {
    canonical: 'Genetics',
    shortAliases: ['gen'],
    fullNames: ['genetics', 'genetcs', 'gentics', 'genetiks'],
  },
  {
    canonical: 'Embryology',
    shortAliases: ['embryo'],
    fullNames: ['embryology', 'embriology', 'embriologie', 'embryologie'],
  },
  {
    canonical: 'Endocrinology',
    shortAliases: ['endo'],
    fullNames: ['endocrinology', 'endocrinologie', 'endocrinolgy', 'endocrinolegy'],
  },
  {
    canonical: 'Pulmonology',
    shortAliases: ['pulm', 'pulmo'],
    fullNames: ['pulmonology', 'pulmonologie', 'pulmology', 'pulmunology'],
  },
  {
    canonical: 'Gastroenterology',
    shortAliases: ['gi', 'gastro'],
    fullNames: ['gastroenterology', 'gastroenterologie', 'gastroenterlogy'],
  },
  {
    canonical: 'Hematology',
    shortAliases: ['heme', 'hema'],
    fullNames: ['hematology', 'hematologie', 'hematolgy', 'haematology'],
  },
  {
    canonical: 'Oncology',
    shortAliases: ['onco'],
    fullNames: ['oncology', 'oncologie', 'oncolgy'],
  },
  {
    canonical: 'Rheumatology',
    shortAliases: ['rheum'],
    fullNames: ['rheumatology', 'reumatology', 'rheumatologie', 'rheumatologu'],
  },
  {
    canonical: 'Dermatology',
    shortAliases: ['derm'],
    fullNames: ['dermatology', 'dermatologie', 'dermatolgy', 'dermatalogy'],
  },
  {
    canonical: 'Urology',
    shortAliases: ['uro'],
    fullNames: ['urology', 'urologie', 'urolgy', 'urolgoy'],
  },
  {
    canonical: 'Gynecology',
    shortAliases: ['gyn', 'obgyn'],
    fullNames: ['gynecology', 'gynecologie', 'gynaecology', 'gynaecolgy'],
  },
  {
    canonical: 'Obstetrics',
    shortAliases: ['ob', 'obs'],
    fullNames: ['obstetrics', 'obstetrique', 'obsterics'],
  },
  {
    canonical: 'Ophthalmology',
    shortAliases: ['ophtho'],
    fullNames: ['ophthalmology', 'ophthalmologie', 'opthamology', 'opthalmology'],
  },
  {
    canonical: 'Surgery',
    shortAliases: ['surg'],
    fullNames: ['surgery', 'surgerie', 'surjery'],
  },
]

// Exact phrase → canonical (checked before discipline matching)
// Only short/misspelled phrases here — long specific topics pass through unchanged
const PHRASE_MAP = {
  'cardio emergencies':           'Cardiovascular Emergencies',
  'cardiovascular emergencies':   'Cardiovascular Emergencies',
  'renal failure':                'Renal Failure',
  'acute renal failure':          'Acute Renal Failure',
  'chronic renal failure':        'Chronic Renal Failure',
  'tca':                          'TCA Cycle',
  'tca cycle':                    'TCA Cycle',
  'krebs cycle':                  'TCA Cycle',
  'primary immunodeficiency':     'Primary Immunodeficiencies',
  'primary immunodeficiencies':   'Primary Immunodeficiencies',
  'heart failure':                'Heart Failure',
  'acid base':                    'Acid-Base Disorders',
  'acid-base':                    'Acid-Base Disorders',
  'acid base disorders':          'Acid-Base Disorders',
  'acid-base disorders':          'Acid-Base Disorders',
  'loop diuretics':               'Loop Diuretics',
}

/**
 * Returns the canonical name if rawTopic matches a known discipline alias,
 * known phrase, or known misspelling/abbreviation. Returns null otherwise.
 * Does NOT title-case fallback — call normalizeTopicForAnalytics for that.
 */
export function matchDisciplineOrPhrase(rawTopic) {
  if (!rawTopic) return null
  const norm = _normStr(rawTopic)
  if (!norm) return null
  const words = norm.split(/\s+/).filter(Boolean)
  const wordCount = words.length
  const len = norm.replace(/ /g, '').length  // char length ignoring spaces

  // 1. Phrase map (exact, multi-word or TCA-style abbreviations)
  if (PHRASE_MAP[norm]) return PHRASE_MAP[norm]

  // 2. Short alias exact match (single-word abbreviations like "neuro", "psych")
  if (wordCount === 1) {
    for (const entry of DISCIPLINE_MAP) {
      if (entry.shortAliases.includes(norm)) return entry.canonical
    }
  }

  // 3. Exact fullName match (single or two-word, catches listed misspellings)
  if (wordCount <= 2 && len >= 6) {
    for (const entry of DISCIPLINE_MAP) {
      if (entry.fullNames.includes(norm)) return entry.canonical
    }
  }

  // 4. Fuzzy fullName match — only for 1-2 word inputs of reasonable length
  //    Length cap (≤20) + quick size filter prevent specific multi-syllable
  //    clinical terms (e.g. "neurofibromatosis") from fuzzy-collapsing to a discipline
  if (wordCount <= 2 && len >= 6 && len <= 20) {
    const threshold = _fuzzyThreshold(len)
    if (threshold > 0) {
      let best = null
      let bestDist = threshold + 1
      for (const entry of DISCIPLINE_MAP) {
        for (const name of entry.fullNames) {
          const nameLen = name.replace(/ /g, '').length
          if (Math.abs(nameLen - len) > threshold) continue  // cheap pre-filter
          const dist = levenshtein(norm, name)
          if (dist <= threshold && dist < bestDist) {
            bestDist = dist
            best = entry.canonical
          }
        }
      }
      if (best) return best
    }
  }

  return null
}

/**
 * Normalizes a raw topic string for analytics display/grouping.
 * Short aliases and known misspellings collapse to canonical discipline names.
 * Specific multi-word clinical topics pass through title-cased.
 */
export function normalizeTopicForAnalytics(rawTopic) {
  if (!rawTopic) return ''
  const canonical = matchDisciplineOrPhrase(rawTopic)
  if (canonical) return canonical
  return rawTopic.trim().replace(/\b\w/g, c => c.toUpperCase())
}

// ─── Self-tests ────────────────────────────────────────────────────────────────

export function runTopicNormalizerTests() {
  const cases = [
    // Short aliases
    ['neuro',                'Neurology'],
    ['psych',                'Psychiatry'],
    ['cardio',               'Cardiology'],
    ['renal',                'Nephrology'],
    ['nephro',               'Nephrology'],
    ['immuno',               'Immunology'],
    ['pharm',                'Pharmacology'],
    ['biochem',              'Biochemistry'],
    ['micro',                'Microbiology'],
    ['path',                 'Pathology'],
    ['physio',               'Physiology'],
    // Known misspellings (exact fullName entries)
    ['neurlogy',             'Neurology'],
    ['nuerology',            'Neurology'],
    ['psuciatry',            'Psychiatry'],
    ['phyciatry',            'Psychiatry'],
    ['phisiology',           'Physiology'],
    ['pharmocology',         'Pharmacology'],
    // Fuzzy catches
    ['psyciatry',            'Psychiatry'],
    ['neurologie',           'Neurology'],
    // Phrase map
    ['cardio emergencies',   'Cardiovascular Emergencies'],
    ['tca cycle',            'TCA Cycle'],
    ['tca',                  'TCA Cycle'],
    ['renal failure',        'Renal Failure'],
    ['primary immunodeficiency', 'Primary Immunodeficiencies'],
    // Safety — specific clinical terms must NOT collapse to a discipline
    ['neurofibromatosis',    'Neurofibromatosis'],
    ['cardiac tamponade',    'Cardiac Tamponade'],
    ['renal cell carcinoma', 'Renal Cell Carcinoma'],
    ['nephritis',            'Nephritis'],
    ['neuritis',             'Neuritis'],
    ['cardiomyopathy',       'Cardiomyopathy'],
    ['loop diuretics',       'Loop Diuretics'],
  ]

  let passed = 0, failed = 0
  for (const [input, expected] of cases) {
    const result = normalizeTopicForAnalytics(input)
    if (result === expected) {
      passed++
    } else {
      console.warn(`FAIL: normalizeTopicForAnalytics("${input}") = "${result}", expected "${expected}"`)
      failed++
    }
  }
  console.log(`topicNormalizer tests: ${passed} passed, ${failed} failed out of ${cases.length}`)
  return { passed, failed, total: cases.length }
}
