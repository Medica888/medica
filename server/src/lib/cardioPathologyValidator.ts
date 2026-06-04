/**
 * Cardiovascular Pathology Specialty Validator
 *
 * Pure rule-based validator that checks whether an AI-generated question
 * correctly tests a cardiovascular pathology concept. All rules are concept-
 * level (disease mechanisms, histologic findings, clinical clue patterns) —
 * no exact question text is stored or reproduced.
 *
 * Integrated into scoreQuestion / scoreNbmeQuestion as additive metadata.
 * status === 'fail'         → adds specialty_validation_failed to rejectionReasons
 * status === 'warn'         → attached as metadata only, no gate
 * status === 'not_applicable' → no effect on validation
 */

// ── Public types ──────────────────────────────────────────────────────────────

export type SpecialtyValidationStatus = 'pass' | 'warn' | 'fail' | 'not_applicable';

export interface SpecialtyValidationResult {
  specialty: 'cardiovascular_pathology';
  matchedConcept: string | null;
  score: number;
  status: SpecialtyValidationStatus;
  strengths: string[];
  warnings: string[];
  rejectionReasons: string[];
}

export interface SpecialtyQuestionInput {
  stem: string;
  options: Array<{ letter: string; text: string }>;
  correct: string;
  explanation?: string;
  subject?: string;
  system?: string;
  topic?: string;
  testedConcept?: string;
  questionAngle?: string;
  usmleContentArea?: string;
  physicianTask?: string;
}

// ── Internal framework types ──────────────────────────────────────────────────

interface PatternGroup {
  id: string;
  label: string;
  patterns: RegExp[];
}

interface ConceptRule {
  id: string;
  name: string;
  /** All groups must match at least partially for a strong match. */
  requiredClues: PatternGroup[];
  /** Extra confidence if matched. */
  supportingClues: PatternGroup[];
  /** What the correct option should contain when this is a pathology-finding task. */
  expectedAnswerPatterns: PatternGroup[];
  /** What the correct option must NOT contain — indicates wrong mechanism. */
  wrongAnswerPatterns: PatternGroup[];
  /** If any stem pattern here matches, this concept is an unlikely interpretation. */
  excludeIfPresent: PatternGroup[];
}

// ── Detection regexes (concept-level vocabulary, not exam text) ───────────────

/** Strong: specific disease names or histology terms that unambiguously signal
 *  cardiovascular pathology discipline. One match is sufficient for detection. */
const STRONG_CARDIO_PATH_RE = /\b(thromboangiitis\s+obliterans|buerger'?s?\s+(disease|syndrome)?|kawasaki\s+(disease)?|polyarteritis\s+nodosa|takayasu\s*(arteritis)?|giant\s+cell\s+arteritis|temporal\s+arteritis|aschoff\s+(bodies?|nodules?)|anitschkow\s+(cells?|histiocytes?)|cystic\s+medial\s+(necrosis|degeneration)|onion.?skin\s+(arteriole|arteriolosclerosis|thickening)|hyperplastic\s+arteriolosclerosis|fibrinoid\s+necrosis\s+of\s+(artery|arteriole|vessel|media))\b/i;

/** Medium: histopathologic vocabulary that requires a cardiovascular or pathology-task
 *  context signal to confirm detection. */
const MEDIUM_CARDIO_PATH_RE = /\b(foam\s+cells?|fibrous\s+cap|cholesterol\s+cleft|lipid.{0,15}intimal|intimal\s+plaque|fibrinoid\s+necrosis|granulomatous.{0,25}(vasculitis|arteritis)|coronary\s+artery\s+aneurysm|verrucous\s+vegetat|coagulative\s+necrosis.{0,30}(cardiac|heart|myocardial)|transmural\s+inflam.{0,30}(artery|vessel))\b/i;

/** Pathology task: the question is asking about a microscopic / mechanistic finding,
 *  not a clinical diagnosis or treatment. */
const PATHOLOGY_TASK_RE = /\b(microscop\w*|histolog\w*|biopsy|histological\s+finding|characteristic\s+finding|what\s+(would\s+)?you\s+(see|find|expect|observe)|what\s+(are|is)\s+(the\s+)?(cells?|finding|appearance|change)|most\s+characteristic|mechanism\s+of\s+injury|underlying\s+patholog\w*|pathological\s+finding|on\s+(light\s+)?microscop\w*|gross\s+patholog\w*)\b/i;

/** Cardiovascular system signals — used to disambiguate from renal/pulmonary pathology. */
const CARDIO_SYSTEM_RE = /\b(cardiovascular|cardiac|heart|aortic|aorta|coronary|vascular|arterial|arteries|artery|arterioles?|myocard\w*|vessels?|ventricular|valv\w*|endocard\w*|pericardial?)\b/i;

/** MI ischemic context — requires explicit histology language to trigger detection. */
const MI_ISCHEMIC_RE = /\b(myocardial\s+infarct|heart\s+attack|ST\s+elevation|troponin|STEMI|ischemic\s+(cardiomyopathy|heart))\b/i;

/** MI temporal language — days/hours/weeks after infarct. */
const MI_TEMPORAL_RE = /\b(\d+\s*(hour|day|week)s?\s*after|first\s+(24\s*h|day|hour)|within\s+\d+\s*(hour|day)|day\s+\d+\b|on\s+day\s+\d|at\s+\d+\s*(hour|day))\b/i;

// ── Helper utilities ──────────────────────────────────────────────────────────

function anyGroupMatch(text: string, groups: PatternGroup[]): boolean {
  return groups.some(g => g.patterns.some(p => p.test(text)));
}

function countMatchedGroups(text: string, groups: PatternGroup[]): number {
  return groups.filter(g => g.patterns.some(p => p.test(text))).length;
}

function getOptionText(
  options: Array<{ letter: string; text: string }>,
  letter: string,
): string {
  return (options.find(o => o.letter === letter)?.text ?? '').trim();
}

// ── Concept rules ─────────────────────────────────────────────────────────────
// All patterns are concept-level (disease mechanism, histologic finding, clinical
// clue vocabulary) — no exact exam question text is reproduced here.

const CONCEPT_RULES: ConceptRule[] = [

  // ── A. Buerger disease / thromboangiitis obliterans ────────────────────────
  {
    id: 'buerger_disease',
    name: 'Buerger disease / thromboangiitis obliterans',
    requiredClues: [
      {
        id: 'tobacco_use',
        label: 'Active tobacco or smoking history',
        patterns: [/\b(smok\w*|tobacco|cigarette|nicotine|pack.{0,10}year|pack.{0,10}day)\b/i],
      },
      {
        id: 'distal_ischemia',
        label: 'Distal limb ischemia, ulceration, or claudication',
        patterns: [/\b(finger\w*|toe\w*|digit\w*|foot|feet|hand|wrist|ankle|peripheral|extremit\w*|claudicat\w*|ulcer\w*|gangren\w*|distal\s+(pain|ischemia|limb)|rest\s+pain)\b/i],
      },
    ],
    supportingClues: [
      {
        id: 'superficial_phlebitis',
        label: 'Migratory superficial thrombophlebitis',
        patterns: [/\b(thrombophlebit|superficial\s+phlebit|migratory\s+phlebit)\b/i],
      },
      {
        id: 'young_age',
        label: 'Young or middle-aged patient (under 50)',
        patterns: [/\b(young|2[0-9][\s-]*(year|yo)|3[0-9][\s-]*(year|yo)|4[0-9][\s-]*(year|yo)|adolescent|middle.?aged)\b/i],
      },
      {
        id: 'normal_lipids',
        label: 'No classic atherosclerosis risk profile noted',
        patterns: [/\b(normal\s+lipids?\w*|no\s+diabet\w*|without\s+diabet\w*|otherwise\s+healthy|no\s+hyperlipid\w*|no\s+prior\s+cardiac)\b/i],
      },
    ],
    expectedAnswerPatterns: [
      {
        id: 'thrombosing_vasculitis',
        label: 'Segmental thrombosing vasculitis involving arteries, veins, and/or nerves',
        patterns: [/\b(thromboangiitis|thrombosing\s+vasculitis|occlusive\s+thrombus|segmental.{0,30}(artery|thrombus)|artery.{0,40}vein.{0,40}nerve|vein.{0,40}nerve|contiguous\s+(nerve|vessel)|thrombus.{0,30}inflam|organizing\s+thrombus)\b/i],
      },
    ],
    wrongAnswerPatterns: [
      {
        id: 'atherosclerosis_mechanism',
        label: 'Lipid-plaque, foam cells, or granulomatous inflammation — wrong for Buerger',
        patterns: [/\b(lipid.{0,20}plaque|foam\s+cells?|fibrous\s+cap|cholesterol\s+cleft|granuloma\w*|onion.?skin|hyperplastic\s+arteriolosclerosis)\b/i],
      },
    ],
    excludeIfPresent: [
      {
        id: 'elderly_ath_risk',
        label: 'Elderly patient (65+) OR classic atherosclerosis context — Buerger unlikely',
        patterns: [
          /\b(6[5-9]|[7-9]\d)[\s-]*(year|yo)\b/i,
          /\b(type\s+[12]\s+diabet\w*|LDL.{0,30}elevat\w*|atherosclerosis.{0,60}peripheral|known\s+coronary\s+artery\s+disease)\b/i,
        ],
      },
    ],
  },

  // ── B. Giant cell arteritis ────────────────────────────────────────────────
  {
    id: 'giant_cell_arteritis',
    name: 'Giant cell arteritis (temporal arteritis)',
    requiredClues: [
      {
        id: 'older_adult',
        label: 'Older adult, typically 50 years or more',
        patterns: [/\b([5-9]\d)[\s-]*(year|yo)|elderly|older\s+adult|post.?menopaus\w*\b/i],
      },
      {
        id: 'cranial_symptoms',
        label: 'Headache, jaw claudication, visual symptoms, or temporal tenderness',
        patterns: [/\b(headache|jaw\s+claudicat|vision\s+loss|amaurosis|visual|temporal\s+(artery|region|tenderness)|blind|diplopia|scalp\s+tender)\b/i],
      },
    ],
    supportingClues: [
      {
        id: 'elevated_esr',
        label: 'Elevated ESR or CRP',
        patterns: [/\b(ESR|erythrocyte\s+sedimentation|elevated\s+inflammatory\s+marker|CRP)\b/i],
      },
      {
        id: 'polymyalgia_rheumatica',
        label: 'Proximal myalgia or polymyalgia rheumatica',
        patterns: [/\b(polymyalgia|shoulder\s+girdle|hip\s+girdle|proximal\s+muscle\s+ache)\b/i],
      },
    ],
    expectedAnswerPatterns: [
      {
        id: 'granulomatous_iel',
        label: 'Granulomatous inflammation with giant cells and internal elastic lamina fragmentation',
        patterns: [/\b(granulomatous|giant\s+cell|internal\s+elastic\s+lamina|elastic\s+membrane|large.{0,20}medium\s+(artery|vessel)|temporal\s+artery\s+biopsy)\b/i],
      },
    ],
    wrongAnswerPatterns: [
      {
        id: 'small_vessel_or_anca',
        label: 'Small vessel / ANCA-associated / fibrinoid necrosis without granuloma',
        patterns: [/\b(fibrinoid\s+necrosis.{0,40}without.{0,20}granuloma|p-ANCA|c-ANCA|myeloperoxidase|proteinase.?3|small\s+vessel|glomerulonephritis)\b/i],
      },
    ],
    excludeIfPresent: [
      {
        id: 'young_adult',
        label: 'Young patient (under 40) — GCA unlikely',
        patterns: [/\b([1-3]\d)[\s-]*(year|yo)|adolescent|child\b/i],
      },
    ],
  },

  // ── C. Takayasu arteritis ──────────────────────────────────────────────────
  {
    id: 'takayasu_arteritis',
    name: 'Takayasu arteritis (pulseless disease)',
    requiredClues: [
      {
        id: 'young_female',
        label: 'Young woman, typically under 40',
        patterns: [/\b([1-3]\d)[\s-]*(year|yo).{0,30}(woman|female)|young\s+(woman|female)|female.{0,30}[1-3]\d[\s-]*(year|yo)\b/i],
      },
      {
        id: 'large_vessel',
        label: 'Pulseless disease, arm claudication, blood pressure discrepancy, or aortic arch involvement',
        patterns: [/\b(pulseless|absent\s+pulse|upper\s+extremity\s+claudicat|arm\s+claudicat|blood\s+pressure\s+differ|aortic\s+arch|subclavian|carotid|vertebral\s+artery)\b/i],
      },
    ],
    supportingClues: [
      {
        id: 'asian_descent',
        label: 'Asian or Southeast Asian background',
        patterns: [/\b(asian|korean|japanese|chinese|southeast\s+asian|indian\s+subcontinent)\b/i],
      },
    ],
    expectedAnswerPatterns: [
      {
        id: 'granulomatous_large_vessel',
        label: 'Granulomatous large-vessel vasculitis with aortic arch branch stenosis',
        patterns: [/\b(granulomatous|panarteritis|large.{0,20}vessel\s+vasculitis|aortic\s+arch|skip\s+lesion|fibrosis\s+of\s+(media|adventitia)|adventitial\s+thickening)\b/i],
      },
    ],
    wrongAnswerPatterns: [
      {
        id: 'medium_small_vessel',
        label: 'Medium or small vessel mechanism — wrong for Takayasu',
        patterns: [/\b(medium.{0,15}vessel\s+vasculitis|ANCA|fibrinoid\s+necrosis\s+of\s+medium|coronary\s+aneurysm|renal\s+artery\s+microaneurysm)\b/i],
      },
    ],
    excludeIfPresent: [
      {
        id: 'elderly_male',
        label: 'Elderly male — unlikely Takayasu',
        patterns: [/\b(6[0-9]|[7-9]\d)[\s-]*(year|yo).{0,30}(man|male)\b/i],
      },
    ],
  },

  // ── D. Polyarteritis nodosa ────────────────────────────────────────────────
  {
    id: 'polyarteritis_nodosa',
    name: 'Polyarteritis nodosa (PAN)',
    requiredClues: [
      {
        id: 'medium_vessel_systemic',
        label: 'Medium-vessel involvement with systemic manifestations',
        patterns: [/\b(kidney|renal|gut|mesenteric|abdominal|peripheral\s+neuropath\w*|mononeuritis\s+multiplex|skin\s+(nodule|ulcer\w*|livedo)|purpura|testis|orchitis|muscle\s+pain)\b/i],
      },
      {
        id: 'hepatitis_or_exclusion',
        label: 'Hepatitis B association or lung-sparing noted',
        patterns: [/\b(hepatitis\s+B|HBV|hep\s+B|spares?\s+lung|no\s+lung\s+involvement|without\s+pulmonary)\b/i],
      },
    ],
    supportingClues: [
      {
        id: 'aneurysmal_nodules',
        label: 'Angiographic microaneurysms or nodular appearance',
        patterns: [/\b(microaneurysm|aneurysmal\s+nodule|angiograph|beading\s+of\s+artery)\b/i],
      },
    ],
    expectedAnswerPatterns: [
      {
        id: 'fibrinoid_necrosis',
        label: 'Fibrinoid necrosis with transmural inflammation of medium arteries',
        patterns: [/\b(fibrinoid\s+necrosis|transmural\s+inflam|necrotizing\s+arteritis|segmental\s+necrotizing|medium\s+(artery|vessel).{0,30}(necrosis|inflam))\b/i],
      },
    ],
    wrongAnswerPatterns: [
      {
        id: 'lung_or_granuloma',
        label: 'Lung involvement or granulomatous inflammation — wrong for PAN',
        patterns: [/\b(pulmonary\s+(infiltrate|haemorrhage|vasculitis)|granulomatous|giant\s+cell|p-ANCA|ANCA.{0,20}(positive|associated))\b/i],
      },
    ],
    excludeIfPresent: [
      {
        id: 'respiratory_predominant',
        label: 'Predominantly respiratory symptoms — PAN spares lungs',
        patterns: [/\b(hemoptysis|alveolar\s+hemorrhage|diffuse\s+alveolar|pulmonary\s+capillaritis)\b/i],
      },
    ],
  },

  // ── E. Kawasaki disease ────────────────────────────────────────────────────
  {
    id: 'kawasaki_disease',
    name: 'Kawasaki disease',
    requiredClues: [
      {
        id: 'pediatric_age',
        label: 'Pediatric patient',
        patterns: [/\b(child|infant|toddler|boy|girl|kid|pediatric|[1-9][\s-]*(year|month|yo)|1[0-4][\s-]*(year|yo)|young\s+child|preschool)\b/i],
      },
      {
        id: 'fever_plus_one',
        label: 'Fever with mucocutaneous or lymph node features',
        patterns: [/\b(fever|rash|conjunctivit|strawberry\s+tongue|lip\s+(redness|cracking|changes)|cervical\s+lymphadenopathy|palmar\s+erythem|desquamat|extremity\s+change)\b/i],
      },
    ],
    supportingClues: [
      {
        id: 'aspirin_treatment',
        label: 'High-dose aspirin or IVIG treatment context',
        patterns: [/\b(aspirin|IVIG|intravenous\s+immunoglobulin)\b/i],
      },
    ],
    expectedAnswerPatterns: [
      {
        id: 'coronary_aneurysm',
        label: 'Coronary artery aneurysm or medium-vessel vasculitis',
        patterns: [/\b(coronary\s+artery\s+aneurysm|coronary\s+aneurysm|medium.{0,15}vessel\s+vasculitis|dilatation\s+of\s+coronary)\b/i],
      },
    ],
    wrongAnswerPatterns: [
      {
        id: 'adult_vasculitis',
        label: 'Adult-type vasculitis mechanisms',
        patterns: [/\b(granulomatous|giant\s+cell|ANCA|fibrinoid\s+necrosis\s+of\s+(medium|large)|thromboangiitis)\b/i],
      },
    ],
    excludeIfPresent: [
      {
        id: 'adult_age',
        label: 'Adult patient',
        patterns: [/\b([2-9]\d)[\s-]*(year|yo).{0,10}(man|woman|male|female|adult)\b/i],
      },
    ],
  },

  // ── F. Atherosclerosis ────────────────────────────────────────────────────
  {
    id: 'atherosclerosis',
    name: 'Atherosclerosis',
    requiredClues: [
      {
        id: 'atherogenic_risk_factors',
        label: 'Classic atherosclerosis risk factors (diabetes, hyperlipidemia, hypertension, smoking)',
        patterns: [/\b(diabet\w*|hyperlipidem\w*|LDL\s+(elevated|high|cholesterol)|hypercholes\w*|hypertens\w*|smok\w*|obesity|metabolic\s+syndrome|sedentary|age.{0,10}risk)\b/i],
      },
      {
        id: 'vascular_disease_manifestation',
        label: 'Clinical manifestation: claudication, coronary, cerebrovascular, or peripheral artery disease',
        patterns: [/\b(claudicat\w*|angina|chest\s+pain|coronary|peripheral\s+artery\s+disease|stroke|TIA|carotid|atherosclerosis|plaque|stenosis|ischemic\s+heart)\b/i],
      },
    ],
    supportingClues: [
      {
        id: 'older_age',
        label: 'Older patient (over 45)',
        patterns: [/\b([4-9]\d)[\s-]*(year|yo)\b/i],
      },
    ],
    expectedAnswerPatterns: [
      {
        id: 'atheroma_histology',
        label: 'Lipid-laden intimal plaque, foam cells, fibrous cap, or cholesterol clefts',
        patterns: [/\b(foam\s+cells?|fibrous\s+cap|cholesterol\s+cleft|lipid.{0,20}(core|plaque|laden)|intimal\s+(plaque|thickening)|atheroma|fatty\s+streak|macrophage.{0,20}(lipid|foam)|necrotic\s+core)\b/i],
      },
    ],
    wrongAnswerPatterns: [
      {
        id: 'vasculitis_mechanism',
        label: 'Inflammatory vasculitis mechanisms — wrong for atherosclerosis',
        patterns: [/\b(granulomatous|giant\s+cell|fibrinoid\s+necrosis\s+of|thromboangiitis|onion.?skin|hyperplastic\s+arteriolosclerosis)\b/i],
      },
    ],
    excludeIfPresent: [
      {
        id: 'no_ath_risk_young',
        label: 'Young patient without risk factors — unlikely primary atherosclerosis',
        patterns: [/\b(no\s+(diabet\w*|hyperlipidem\w*|smok\w*|hypertens\w*)|otherwise\s+healthy\s+young|[1-2]\d[\s-]*(year[\s-]*old|yo)\b)/i],
      },
    ],
  },

  // ── G. Malignant hypertension vascular pathology ──────────────────────────
  {
    id: 'malignant_hypertension',
    name: 'Malignant hypertension vascular pathology',
    requiredClues: [
      {
        id: 'severe_htn',
        label: 'Severe or malignant hypertension',
        patterns: [/\b(malignant\s+hypertension|hypertensive\s+(emergency|crisis|urgency)|blood\s+pressure.{0,30}(2[0-9][0-9]|[2-9]\d{2})\s*\/|[2-9]\d{2}\s*\/\s*\d+\s*mmhg|severely\s+(elevated|high)\s+blood\s+pressure)\b/i],
      },
      {
        id: 'end_organ_damage',
        label: 'Hypertensive end-organ damage: renal, retinal, or neurological',
        patterns: [/\b(papilledema|retinal\s+hemorrhage|renal\s+(insufficiency|failure|injury)|acute\s+kidney|creatinine.{0,20}elevat|hematuria|encephalopathy|headache.{0,30}hypertens)\b/i],
      },
    ],
    supportingClues: [
      {
        id: 'microangiopathic',
        label: 'Microangiopathic hemolytic anemia or schistocytes',
        patterns: [/\b(microangiopathic|schistocyte|thrombotic\s+microangiopathy|TMA)\b/i],
      },
    ],
    expectedAnswerPatterns: [
      {
        id: 'onion_skin_hyperplastic',
        label: 'Hyperplastic arteriolosclerosis — onion-skin laminated thickening of arterioles',
        patterns: [/\b(hyperplastic\s+arteriolosclerosis|onion.?skin|laminated\s+(thickening|wall)|concentric\s+intimal\s+thickening|arteriolar\s+(wall\s+)?thickening|smooth\s+muscle.{0,30}proliferat)\b/i],
      },
    ],
    wrongAnswerPatterns: [
      {
        id: 'lipid_or_granuloma',
        label: 'Lipid plaque or granulomatous inflammation — wrong for malignant hypertension arteriole pathology',
        patterns: [/\b(foam\s+cells?|fibrous\s+cap|granulomatous\s+inflam|giant\s+cell|thromboangiitis)\b/i],
      },
    ],
    excludeIfPresent: [],
  },

  // ── H. Aortic dissection ──────────────────────────────────────────────────
  {
    id: 'aortic_dissection',
    name: 'Aortic dissection',
    requiredClues: [
      {
        id: 'tearing_pain',
        label: 'Sudden tearing or ripping chest/back pain',
        patterns: [/\b(tearing|ripping|tearing.{0,20}chest|chest.{0,20}back|back.{0,20}chest|sudden\s+severe\s+(chest|back|pain)|knife.?like)\b/i],
      },
      {
        id: 'dissection_context',
        label: 'Predisposing condition or imaging finding: Marfan, hypertension, pulse deficit, widened mediastinum',
        patterns: [/\b(marfan|bicuspid\s+aortic\s+valve|blood\s+pressure.{0,30}arm|pulse\s+deficit|widened\s+mediastinum|aortic\s+dissection|type\s+[AB]\s+dissection|intramural\s+hematoma)\b/i],
      },
    ],
    supportingClues: [
      {
        id: 'connective_tissue',
        label: 'Connective tissue disorder',
        patterns: [/\b(marfan|ehlers.?danlos|loeys.?dietz|bicuspid|connective\s+tissue)\b/i],
      },
    ],
    expectedAnswerPatterns: [
      {
        id: 'medial_degeneration',
        label: 'Cystic medial degeneration, intimal tear, or blood dissecting through media',
        patterns: [/\b(cystic\s+medial\s+(necrosis|degeneration)|medial\s+(degeneration|weakening)|intimal\s+tear|false\s+lumen|blood.{0,30}(dissect|track).{0,30}media|mucoid\s+degeneration\s+of\s+(media|wall))\b/i],
      },
    ],
    wrongAnswerPatterns: [
      {
        id: 'atheroma_or_vasculitis',
        label: 'Atherosclerotic plaque or vasculitis mechanism — wrong for aortic dissection',
        patterns: [/\b(lipid.{0,15}plaque|foam\s+cells?|granulomatous\s+inflam|fibrinoid\s+necrosis\s+of\s+aorta)\b/i],
      },
    ],
    excludeIfPresent: [],
  },

  // ── I. Myocardial infarction timeline ─────────────────────────────────────
  {
    id: 'mi_timeline',
    name: 'Myocardial infarction — histologic timeline',
    requiredClues: [
      {
        id: 'mi_ischemic_context',
        label: 'Myocardial infarction or ischemic cardiac event',
        patterns: [/\b(myocardial\s+infarct|heart\s+attack|ST.?elevation|troponin|STEMI|died.{0,30}(after|following).{0,30}(infarct|MI)|after\s+(a|his|her)\s+(MI|myocardial|heart\s+attack))\b/i],
      },
      {
        id: 'time_specification',
        label: 'Explicit temporal reference (hours, days, weeks) post-infarct',
        patterns: [/\b(\d+\s*(hour|day|week)s?\s*(after|later|post)|first\s+(24|48)(\s*h|\s*hour)|within\s+\d+\s*(hour|day)s?|day\s+\d+|at\s+\d+\s*(hour|day)|week\s+\d+|two\s+weeks?|one\s+week)\b/i],
      },
    ],
    supportingClues: [
      {
        id: 'histology_task',
        label: 'Question specifically asks about histologic or microscopic findings',
        patterns: [/\b(microscop|histolog|biopsy|what\s+(cells?|would\s+you\s+see|finding)|characteristic\s+cell|appearance\s+of\s+(myocardium|heart\s+tissue))\b/i],
      },
    ],
    expectedAnswerPatterns: [
      {
        id: 'mi_histology',
        label: 'Time-appropriate MI histologic change: coagulative necrosis, neutrophils, macrophages, granulation, scar',
        patterns: [/\b(coagulative\s+necrosis|neutrophil|acute\s+inflam(mation)?|macrophage|granulation\s+tissue|fibrosis|fibrous\s+scar|revascularization|contraction\s+band)\b/i],
      },
    ],
    wrongAnswerPatterns: [
      {
        id: 'wrong_mi_finding',
        label: 'Finding inconsistent with any MI timeline stage',
        patterns: [/\b(lymphocyte.{0,20}(predominat|infiltrat).{0,20}(acute|immediate)|granuloma.{0,20}(necrosis|giant)|onion.?skin|foam\s+cell)\b/i],
      },
    ],
    excludeIfPresent: [],
  },

  // ── J. Rheumatic heart disease ────────────────────────────────────────────
  {
    id: 'rheumatic_heart_disease',
    name: 'Rheumatic heart disease',
    requiredClues: [
      {
        id: 'strep_history',
        label: 'Prior streptococcal pharyngitis or rheumatic fever',
        patterns: [/\b(streptococ|group\s+A\s+strep|rheumatic\s+fever|pharyngitis|sore\s+throat|strep\s+throat|prior\s+strep\s+infection|history\s+of\s+rheumatic)\b/i],
      },
      {
        id: 'cardiac_valve',
        label: 'Cardiac valvular disease: mitral stenosis, regurgitation, or valve damage',
        patterns: [/\b(mitral\s+(stenosis|regurgitation|insufficiency|valve)|valve\s+(damage|lesion|disease|leaflet)|rheumatic\s+heart|aortic\s+(stenosis|regurgitation).{0,30}rheumatic|valvular\s+disease)\b/i],
      },
    ],
    supportingClues: [
      {
        id: 'migratory_polyarthritis',
        label: 'Migratory polyarthritis or Jones criteria',
        patterns: [/\b(migratory\s+polyarthritis|joint\s+inflam|arthritis.{0,30}migrat|jones\s+criteria|carditis\s+with\s+arthritis)\b/i],
      },
    ],
    expectedAnswerPatterns: [
      {
        id: 'aschoff_bodies',
        label: 'Aschoff bodies, Anitschkow cells, or verrucous vegetations on valve leaflets',
        patterns: [/\b(aschoff\w*|anitschkow\w*|owl.?eye|caterpillar\s+(nucleus|cell)|verrucous\s+vegetat\w*|leaflet\s+(thicken\w*|fus\w*|calcific\w*)|commissural\s+fus\w*)\b/i],
      },
    ],
    wrongAnswerPatterns: [
      {
        id: 'bacterial_endocarditis',
        label: 'Large/friable vegetations of bacterial endocarditis',
        patterns: [/\b(large\s+friable|bacterial\s+endocarditis|bulky\s+vegetat\w*|staphylococ\w*|streptococ\w*\s+(aureus|viridans).{0,30}vegetat\w*)\b/i],
      },
    ],
    excludeIfPresent: [
      {
        id: 'recent_acute_infection',
        label: 'Active bacteremia context suggesting infectious endocarditis over rheumatic',
        patterns: [/\b(bacteremia|blood\s+culture\s+(positive|grew)|IVDU|IV\s+drug|prosthetic\s+valve\s+(infection|endocarditis))\b/i],
      },
    ],
  },

];

// ── Metadata concept map ─────────────────────────────────────────────────────
// Maps lowercase alias patterns to rule IDs.  Used when the AI provides an
// explicit `testedConcept` or `topic` that names a cardiovascular pathology entity.
// This lets the validator anchor to the declared concept even when stem text alone
// is ambiguous (e.g. smoking + claudication matches both Buerger and atherosclerosis).

const CONCEPT_META_ALIASES: Array<{ re: RegExp; id: string }> = [
  { re: /buerger|thromboangiitis\s+obliterans/i,                      id: 'buerger_disease'          },
  { re: /giant.?cell\s+arteritis|temporal\s+arteritis/i,              id: 'giant_cell_arteritis'     },
  { re: /takayasu|pulseless\s+disease/i,                               id: 'takayasu_arteritis'       },
  { re: /polyarteritis\s+nodosa|\bpan\b/i,                            id: 'polyarteritis_nodosa'     },
  { re: /kawasaki|mucocutaneous\s+lymph\s+node/i,                      id: 'kawasaki_disease'         },
  { re: /\batherosclerosis\b|atheroma|intimal\s+plaque/i,              id: 'atherosclerosis'          },
  { re: /malignant\s+hypertension|hyperplastic\s+arteriolosclerosis|onion.?skin\s+arteriole/i,
                                                                        id: 'malignant_hypertension'   },
  { re: /aortic\s+dissection|cystic\s+medial\s+(necrosis|degeneration)/i,
                                                                        id: 'aortic_dissection'        },
  { re: /myocardial\s+infarct.*timeline|mi\s+histol|coagulative\s+necrosis/i,
                                                                        id: 'mi_timeline'              },
  { re: /rheumatic\s+heart|aschoff|anitschkow/i,                      id: 'rheumatic_heart_disease'  },
];

/** Returns the rule ID that `testedConcept` / `topic` explicitly names, or null. */
function resolveConceptFromMeta(q: SpecialtyQuestionInput): string | null {
  const meta = String(q.testedConcept || q.topic || '').toLowerCase().trim();
  if (!meta) return null;
  for (const { re, id } of CONCEPT_META_ALIASES) {
    if (re.test(meta)) return id;
  }
  return null;
}

// ── Detection logic ───────────────────────────────────────────────────────────

function isCardiovascularPathologyDomain(q: SpecialtyQuestionInput): boolean {
  const stem    = String(q.stem          || '').toLowerCase();
  const concept = String(q.testedConcept || q.topic || '').toLowerCase();
  const subject = String(q.subject       || '').toLowerCase();
  const system  = String(q.system        || q.usmleContentArea || '').toLowerCase();

  // 0. Explicit concept metadata — highest-confidence signal
  if (resolveConceptFromMeta(q) !== null) return true;

  // 1. Strong signal: specific disease name or histology term in stem or concept metadata
  if (STRONG_CARDIO_PATH_RE.test(stem) || STRONG_CARDIO_PATH_RE.test(concept)) return true;

  // 2. Subject + system metadata (pathology discipline + cardiovascular system)
  if (/pathol/i.test(subject) && CARDIO_SYSTEM_RE.test(system)) return true;

  // 3. Medium histopathology vocabulary + pathology task language in stem
  if (MEDIUM_CARDIO_PATH_RE.test(stem) && PATHOLOGY_TASK_RE.test(stem)) return true;

  // 4. MI timeline: cardiac ischemia + explicit time reference + histology task language
  if (MI_ISCHEMIC_RE.test(stem) && MI_TEMPORAL_RE.test(stem) && PATHOLOGY_TASK_RE.test(stem)) return true;

  // 5. Pathology-task question with explicit cardiovascular system signal in metadata
  if (PATHOLOGY_TASK_RE.test(stem) && CARDIO_SYSTEM_RE.test(system) && /pathol/i.test(subject)) return true;

  // 6. Pathology-task question + cardiovascular system vocabulary in the stem itself
  //    (catches questions without metadata where disease names aren't in the stem)
  if (PATHOLOGY_TASK_RE.test(stem) && CARDIO_SYSTEM_RE.test(stem)) return true;

  return false;
}

// ── Concept matching ──────────────────────────────────────────────────────────

interface ConceptMatchResult {
  rule: ConceptRule;
  clueScore: number;       // 0–1: proportion of required clue groups matched
  allRequired: boolean;    // all required clue groups matched
  supportingScore: number; // 0–1: proportion of supporting clue groups matched
  answerScore: number;     // 1 = expected match, 0 = no match (0.5 if task not pathology-specific)
  hasWrongAnswer: boolean;
  hasExclusion: boolean;
  totalScore: number;
}

function matchConceptRule(
  q: SpecialtyQuestionInput,
  rule: ConceptRule,
  correctText: string,
  isPathologyTask: boolean,
): ConceptMatchResult {
  const stem = String(q.stem || '').toLowerCase();

  const requiredMatched  = countMatchedGroups(stem, rule.requiredClues);
  const clueScore        = rule.requiredClues.length > 0 ? requiredMatched / rule.requiredClues.length : 0;
  const allRequired      = requiredMatched === rule.requiredClues.length;

  const supportingMatched = countMatchedGroups(stem, rule.supportingClues);
  const supportingScore   = rule.supportingClues.length > 0 ? supportingMatched / rule.supportingClues.length : 0.5;

  const hasExpectedAnswer = anyGroupMatch(correctText, rule.expectedAnswerPatterns);
  const answerScore       = isPathologyTask
    ? (hasExpectedAnswer ? 1.0 : 0.0)
    : 0.5;  // neutral when not a pathology-finding task

  const hasWrongAnswer = isPathologyTask && anyGroupMatch(correctText, rule.wrongAnswerPatterns);
  const hasExclusion   = anyGroupMatch(stem, rule.excludeIfPresent);

  const totalScore = Math.max(0,
    clueScore   * 0.55 +
    answerScore * 0.30 +
    supportingScore * 0.10 +
    (hasWrongAnswer ? -0.35 : 0) +
    (hasExclusion   ? -0.20 : 0),
  );

  return {
    rule, clueScore, allRequired, supportingScore,
    answerScore, hasWrongAnswer, hasExclusion, totalScore,
  };
}

/** True when any OTHER concept (not the winner) has both a positive answer match
 *  and a meaningful clue match — used as the cross-concept FAIL guard. */
function hasPositiveAlternativeConcept(
  winner: ConceptMatchResult,
  allResults: ConceptMatchResult[],
): boolean {
  return allResults.some(r =>
    r.rule.id !== winner.rule.id &&
    r.answerScore >= 1.0 &&
    r.clueScore >= 0.3,
  );
}

// ── Status determination ──────────────────────────────────────────────────────

function buildResult(
  winner: ConceptMatchResult,
  allResults: ConceptMatchResult[],
  isPathologyTask: boolean,
): SpecialtyValidationResult {
  const strengths:        string[] = [];
  const warnings:         string[] = [];
  const rejectionReasons: string[] = [];

  if (winner.allRequired && winner.answerScore >= 1.0)
    strengths.push(`All required ${winner.rule.name} clues matched with correct pathology answer`);
  else if (winner.clueScore >= 0.5 && winner.answerScore >= 1.0)
    strengths.push(`Key ${winner.rule.name} clues matched`);

  if (!winner.allRequired)
    warnings.push(`Missing some required clues for ${winner.rule.name} — check clinical context completeness`);
  if (isPathologyTask && winner.answerScore < 1.0)
    warnings.push(`Expected pathology answer pattern for ${winner.rule.name} not clearly identified`);
  if (winner.hasExclusion)
    warnings.push(`Stem contains context that typically excludes ${winner.rule.name}`);

  // ── Determine status ──────────────────────────────────────────────────────
  // Cross-concept saves only when the winner's clue match is partial.
  // If all required clues matched the winner, the stem is unambiguously about
  // this concept and a competing answer explanation does not forgive the wrong mechanism.
  const hasCrossConceptAlternative = !winner.allRequired && hasPositiveAlternativeConcept(winner, allResults);

  let status: SpecialtyValidationStatus;

  if (winner.clueScore >= 0.5) {
    if (winner.hasWrongAnswer && isPathologyTask && !hasCrossConceptAlternative) {
      // Wrong answer mechanism for a question that is clearly about this concept
      // AND no other concept explains the correct answer
      status = 'fail';
      rejectionReasons.push(`${winner.rule.name}: answer uses a mechanism inconsistent with this concept`);
    } else if (winner.hasExclusion && !hasCrossConceptAlternative) {
      // Wrong clinical context that cannot be explained by another concept
      status = 'fail';
      rejectionReasons.push(`${winner.rule.name}: stem includes context that contradicts this concept`);
    } else if (winner.allRequired && winner.answerScore >= 1.0 && !winner.hasWrongAnswer && !winner.hasExclusion) {
      // All clues present, correct answer matches expected pathology
      status = 'pass';
    } else {
      // Concept matched but something is weak
      status = 'warn';
    }
  } else {
    // Partial clue match only
    status = 'warn';
  }

  const score = Math.min(1.0, Math.max(0, winner.totalScore));

  return {
    specialty: 'cardiovascular_pathology',
    matchedConcept: winner.rule.id,
    score: Math.round(score * 100) / 100,
    status,
    strengths,
    warnings,
    rejectionReasons,
  };
}

// ── Public export ─────────────────────────────────────────────────────────────

/** NOT_APPLICABLE result for non-cardiovascular-pathology questions. */
const NOT_APPLICABLE: SpecialtyValidationResult = {
  specialty: 'cardiovascular_pathology',
  matchedConcept: null,
  score: 0,
  status: 'not_applicable',
  strengths: [],
  warnings: [],
  rejectionReasons: [],
};

/**
 * Validates whether a question correctly tests a cardiovascular pathology concept.
 *
 * Returns not_applicable for questions outside cardiovascular pathology.
 * Returns pass/warn/fail with a matched concept and scoring breakdown.
 *
 * FAIL adds specialty_validation_failed to the question's rejectionReasons.
 * WARN attaches metadata without affecting validationStatus.
 */
export function validateCardiovascularPathology(
  q: SpecialtyQuestionInput,
): SpecialtyValidationResult {
  // Step 1: determine if this is a cardiovascular pathology question
  if (!isCardiovascularPathologyDomain(q)) return NOT_APPLICABLE;

  const correctText    = getOptionText(q.options, q.correct).toLowerCase();
  const isPathologyTask = PATHOLOGY_TASK_RE.test(String(q.stem || '').toLowerCase());

  // Step 2: score all concept rules
  const allResults = CONCEPT_RULES.map(rule =>
    matchConceptRule(q, rule, correctText, isPathologyTask),
  );

  // Step 3: select winner
  // When testedConcept metadata explicitly names a known rule, anchor to that rule
  // (minimum clueScore 0.2 as a sanity guard).  This prevents answer-aware
  // disambiguation from picking a competing concept when the AI has declared its intent.
  const anchoredId = resolveConceptFromMeta(q);
  const anchoredResult = anchoredId
    ? allResults.find(r => r.rule.id === anchoredId) ?? null
    : null;

  if (anchoredResult && anchoredResult.clueScore >= 0.2) {
    return buildResult(anchoredResult, allResults, isPathologyTask);
  }

  // Prefer concepts where the correct answer positively matches expected patterns.
  // This is the answer-aware disambiguation that prevents Buerger/Atherosclerosis overlap.
  const positiveMatches = allResults.filter(r => r.answerScore >= 1.0 && r.clueScore >= 0.3 && !r.hasWrongAnswer);
  const candidates      = allResults.filter(r => r.clueScore >= 0.2);

  if (candidates.length === 0) return NOT_APPLICABLE;

  // Choose winner: positive match by clue score > any match by total score
  const sorted = positiveMatches.length > 0
    ? positiveMatches.sort((a, b) => b.clueScore - a.clueScore || b.totalScore - a.totalScore)
    : candidates.sort((a, b) => b.totalScore - a.totalScore);

  const winner = sorted[0];

  // Step 4: build result
  return buildResult(winner, allResults, isPathologyTask);
}
