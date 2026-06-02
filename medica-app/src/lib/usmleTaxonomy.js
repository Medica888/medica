export const USMLE_CONTENT_AREAS = [
  'Human Development',
  'Immune System',
  'Blood & Lymphoreticular System',
  'Behavioral Health',
  'Nervous System & Special Senses',
  'Skin & Subcutaneous Tissue',
  'Musculoskeletal System',
  'Cardiovascular System',
  'Respiratory System',
  'Gastrointestinal System',
  'Renal & Urinary System',
  'Pregnancy, Childbirth, & the Puerperium',
  'Female and Transgender Reproductive System & Breast',
  'Male and Transgender Reproductive System',
  'Endocrine System',
  'Multisystem Processes & Disorders',
  'Biostatistics, Epidemiology/Population Health, & Interpretation of the Medical Literature',
  'Social Sciences',
]

export const PHYSICIAN_TASKS = [
  'Medical Knowledge: Applying Foundational Science Concepts',
  'Patient Care: History and Physical Examination',
  'Patient Care: Laboratory and Diagnostic Studies',
  'Patient Care: Diagnosis',
  'Patient Care: Prognosis and Outcome',
  'Patient Care: Health Maintenance and Disease Prevention',
  'Patient Care: Pharmacotherapy',
  'Patient Care: Clinical Interventions',
  'Patient Care: Mixed Management',
  'Communication',
  'Professionalism, Legal, and Ethical Principles',
  'Systems-Based Practice and Patient Safety',
  'Practice-Based Learning and Improvement',
]

export const DEFAULT_PHYSICIAN_TASK = 'Medical Knowledge: Applying Foundational Science Concepts'
export const DEFAULT_CONTENT_AREA = 'Multisystem Processes & Disorders'

const CONTENT_ALIASES = new Map([
  ['human development', 'Human Development'],
  ['development', 'Human Development'],
  ['pediatrics', 'Human Development'],
  ['aging', 'Human Development'],
  ['geriatric', 'Human Development'],
  ['immune', 'Immune System'],
  ['immune system', 'Immune System'],
  ['immunology', 'Immune System'],
  ['hypersensitivity', 'Immune System'],
  ['blood', 'Blood & Lymphoreticular System'],
  ['hematology', 'Blood & Lymphoreticular System'],
  ['lymphoreticular', 'Blood & Lymphoreticular System'],
  ['heme', 'Blood & Lymphoreticular System'],
  ['behavioral science', 'Behavioral Health'],
  ['behavioral health', 'Behavioral Health'],
  ['psychiatry', 'Behavioral Health'],
  ['mental health', 'Behavioral Health'],
  ['neurology', 'Nervous System & Special Senses'],
  ['nervous system', 'Nervous System & Special Senses'],
  ['neuro', 'Nervous System & Special Senses'],
  ['special senses', 'Nervous System & Special Senses'],
  ['dermatology', 'Skin & Subcutaneous Tissue'],
  ['skin', 'Skin & Subcutaneous Tissue'],
  ['musculoskeletal', 'Musculoskeletal System'],
  ['cardiovascular', 'Cardiovascular System'],
  ['cardiology', 'Cardiovascular System'],
  ['respiratory', 'Respiratory System'],
  ['pulmonary', 'Respiratory System'],
  ['gastrointestinal', 'Gastrointestinal System'],
  ['gi', 'Gastrointestinal System'],
  ['renal / urinary', 'Renal & Urinary System'],
  ['renal urinary', 'Renal & Urinary System'],
  ['renal', 'Renal & Urinary System'],
  ['urinary', 'Renal & Urinary System'],
  ['nephrology', 'Renal & Urinary System'],
  ['pregnancy', 'Pregnancy, Childbirth, & the Puerperium'],
  ['obstetrics', 'Pregnancy, Childbirth, & the Puerperium'],
  ['puerperium', 'Pregnancy, Childbirth, & the Puerperium'],
  ['reproductive', 'Female and Transgender Reproductive System & Breast'],
  ['female reproductive', 'Female and Transgender Reproductive System & Breast'],
  ['breast', 'Female and Transgender Reproductive System & Breast'],
  ['male reproductive', 'Male and Transgender Reproductive System'],
  ['endocrine', 'Endocrine System'],
  ['endocrinology', 'Endocrine System'],
  ['multisystem', 'Multisystem Processes & Disorders'],
  ['biochemistry', 'Multisystem Processes & Disorders'],
  ['genetics', 'Multisystem Processes & Disorders'],
  ['oncology', 'Multisystem Processes & Disorders'],
  ['infectious disease', 'Multisystem Processes & Disorders'],
  ['microbiology', 'Multisystem Processes & Disorders'],
  ['biostatistics', 'Biostatistics, Epidemiology/Population Health, & Interpretation of the Medical Literature'],
  ['epidemiology', 'Biostatistics, Epidemiology/Population Health, & Interpretation of the Medical Literature'],
  ['population health', 'Biostatistics, Epidemiology/Population Health, & Interpretation of the Medical Literature'],
  ['medical literature', 'Biostatistics, Epidemiology/Population Health, & Interpretation of the Medical Literature'],
  ['ethics', 'Social Sciences'],
  ['social sciences', 'Social Sciences'],
])

const CONTENT_KEYWORDS = [
  { area: 'Human Development', words: ['development', 'pediatric', 'child', 'adolescent', 'aging', 'geriatric'] },
  { area: 'Immune System', words: ['mhc', 'hla', 'complement', 'hypersensitivity', 'autoimmune', 'immunoglobulin', 'b cell', 't cell'] },
  { area: 'Blood & Lymphoreticular System', words: ['anemia', 'hemoglobin', 'platelet', 'coagulation', 'leukemia', 'lymphoma', 'bone marrow'] },
  { area: 'Behavioral Health', words: ['depression', 'anxiety', 'psychosis', 'substance use', 'psychiatric', 'behavioral'] },
  { area: 'Nervous System & Special Senses', words: ['brain', 'spinal cord', 'cranial nerve', 'stroke', 'seizure', 'vision', 'hearing', 'retina'] },
  { area: 'Skin & Subcutaneous Tissue', words: ['skin', 'rash', 'dermatitis', 'melanoma', 'subcutaneous'] },
  { area: 'Musculoskeletal System', words: ['muscle', 'bone', 'joint', 'arthritis', 'fracture', 'ligament', 'tendon'] },
  { area: 'Cardiovascular System', words: ['heart', 'cardiac', 'aortic', 'arrhythmia', 'hypertension', 'myocardial', 'valvular'] },
  { area: 'Respiratory System', words: ['lung', 'pulmonary', 'respiratory', 'asthma', 'copd', 'alveolar', 'pleural'] },
  { area: 'Gastrointestinal System', words: ['liver', 'hepatic', 'bowel', 'stomach', 'colon', 'pancreas', 'bile', 'ascites'] },
  { area: 'Renal & Urinary System', words: ['kidney', 'renal', 'nephron', 'glomerular', 'urinary', 'tubule', 'diuretic'] },
  { area: 'Pregnancy, Childbirth, & the Puerperium', words: ['pregnancy', 'pregnant', 'postpartum', 'placenta', 'preeclampsia', 'fetal'] },
  { area: 'Male and Transgender Reproductive System', words: ['prostate', 'testicular', 'testis', 'male reproductive'] },
  { area: 'Female and Transgender Reproductive System & Breast', words: ['ovarian', 'uterine', 'cervical', 'breast', 'female reproductive'] },
  { area: 'Endocrine System', words: ['thyroid', 'adrenal', 'pituitary', 'insulin', 'diabetes', 'cortisol', 'pth'] },
  { area: 'Biostatistics, Epidemiology/Population Health, & Interpretation of the Medical Literature', words: ['sensitivity', 'specificity', 'relative risk', 'odds ratio', 'confidence interval', 'study design'] },
  { area: 'Social Sciences', words: ['ethics', 'consent', 'confidentiality', 'communication', 'professionalism', 'patient safety'] },
]

const TASK_ALIASES = new Map([
  ['mechanism', DEFAULT_PHYSICIAN_TASK],
  ['pathophysiology', DEFAULT_PHYSICIAN_TASK],
  ['adverse-effect', 'Patient Care: Pharmacotherapy'],
  ['pharmacology', 'Patient Care: Pharmacotherapy'],
  ['treatment', 'Patient Care: Pharmacotherapy'],
  ['diagnosis', 'Patient Care: Diagnosis'],
  ['lab-interpretation', 'Patient Care: Laboratory and Diagnostic Studies'],
  ['lab interpretation', 'Patient Care: Laboratory and Diagnostic Studies'],
  ['complication', 'Patient Care: Prognosis and Outcome'],
  ['prevention', 'Patient Care: Health Maintenance and Disease Prevention'],
  ['screening', 'Patient Care: Health Maintenance and Disease Prevention'],
  ['ethics', 'Professionalism, Legal, and Ethical Principles'],
  ['patient-safety', 'Systems-Based Practice and Patient Safety'],
  ['communication', 'Communication'],
  ['biostatistics', 'Practice-Based Learning and Improvement'],
])

const TASK_KEYWORDS = [
  { task: 'Patient Care: History and Physical Examination', words: ['physical examination', 'history finding', 'exam finding', 'maneuver'] },
  { task: 'Patient Care: Laboratory and Diagnostic Studies', words: ['lab', 'laboratory', 'imaging', 'ct', 'mri', 'biopsy', 'diagnostic study'] },
  { task: 'Patient Care: Diagnosis', words: ['diagnosis', 'most likely', 'localization'] },
  { task: 'Patient Care: Prognosis and Outcome', words: ['prognosis', 'outcome', 'mortality', 'survival', 'complication'] },
  { task: 'Patient Care: Health Maintenance and Disease Prevention', words: ['prevention', 'screening', 'vaccine', 'health maintenance'] },
  { task: 'Patient Care: Pharmacotherapy', words: ['drug', 'pharmacotherapy', 'therapy', 'treatment', 'adverse effect', 'mechanism of action'] },
  { task: 'Patient Care: Clinical Interventions', words: ['procedure', 'surgery', 'intervention', 'catheter', 'biopsy'] },
  { task: 'Communication', words: ['communicate', 'counsel', 'explain to the patient', 'interpreter', 'surrogate'] },
  { task: 'Professionalism, Legal, and Ethical Principles', words: ['ethics', 'consent', 'confidentiality', 'capacity', 'legal'] },
  { task: 'Systems-Based Practice and Patient Safety', words: ['patient safety', 'medical error', 'quality improvement', 'handoff'] },
  { task: 'Practice-Based Learning and Improvement', words: ['study design', 'bias', 'confidence interval', 'p value', 'research ethics'] },
]

export function normalizeUsmleContentArea(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const exact = USMLE_CONTENT_AREAS.find(area => _norm(area) === _norm(raw))
  if (exact) return exact
  return CONTENT_ALIASES.get(_norm(raw)) || ''
}

export function normalizePhysicianTask(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const exact = PHYSICIAN_TASKS.find(task => _norm(task) === _norm(raw))
  if (exact) return exact
  return TASK_ALIASES.get(_norm(raw)) || ''
}

export function inferUsmleContentArea(question = {}, config = {}) {
  const direct = normalizeUsmleContentArea(question.usmleContentArea || config.usmleContentArea)
  if (direct) return direct

  const fields = [
    question.system,
    config.system,
    question.subject,
    config.subject,
  ]

  for (const field of fields) {
    const mapped = normalizeUsmleContentArea(field)
    if (mapped) return _resolveReproductiveArea(mapped, question, config)
  }

  const haystack = _questionText(question, config)
  for (const entry of CONTENT_KEYWORDS) {
    if (entry.words.some(word => haystack.includes(word))) return entry.area
  }

  return DEFAULT_CONTENT_AREA
}

export function inferPhysicianTask(question = {}, config = {}) {
  const direct = normalizePhysicianTask(question.physicianTask || config.physicianTask)
  if (direct) return direct

  const angle = normalizePhysicianTask(question.questionAngle || config.questionAngle)
  if (angle) return angle

  const haystack = _questionText(question, config)
  for (const entry of TASK_KEYWORDS) {
    if (entry.words.some(word => haystack.includes(word))) return entry.task
  }

  return DEFAULT_PHYSICIAN_TASK
}

export function enrichQuestionWithUsmleTaxonomy(question = {}, config = {}) {
  const usmleContentArea = inferUsmleContentArea(question, config)
  const physicianTask = inferPhysicianTask(question, config)
  return {
    ...question,
    usmleContentArea,
    usmleSubdomain: question.usmleSubdomain || question.weakSpotCategory || question.topic || question.testedConcept || '',
    physicianTask,
  }
}

function _resolveReproductiveArea(area, question, config) {
  if (area !== 'Female and Transgender Reproductive System & Breast') return area
  const haystack = _questionText(question, config)
  if (['prostate', 'testicular', 'testis', 'sperm', 'male reproductive'].some(word => haystack.includes(word))) {
    return 'Male and Transgender Reproductive System'
  }
  if (['pregnancy', 'pregnant', 'postpartum', 'placenta', 'puerperium', 'preeclampsia'].some(word => haystack.includes(word))) {
    return 'Pregnancy, Childbirth, & the Puerperium'
  }
  return area
}

function _questionText(question, config) {
  return [
    question.usmleContentArea,
    question.system,
    question.subject,
    question.topic,
    question.canonicalTopic,
    question.testedConcept,
    question.weakSpotCategory,
    question.stem,
    question.explanation,
    config.system,
    config.subject,
    config.topic,
    config.clinicalFocus,
  ].map(v => String(v || '').toLowerCase()).join(' ')
}

function _norm(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
