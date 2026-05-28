import { shuffleQuestionOptions } from './questionNormalizer.js'
import {
  resolveGenerationScope,
  normalizeGenerationConfig,
  isSpecificScope,
  isQuestionInScope,
  detectDuplicateQuestions,
  applyExpandedScopeMetadata,
} from './generationScope.js'
import { applyTopicMetadataToQuestion } from './topicIntelligence.js'
import { getSessionHistory } from './storage.js'
import {
  buildSeenState,
  filterUnseenQuestions,
  validateUniqueQuestions,
  EMPTY_SEEN_STATE,
} from './questionDedup.js'

function _seenStateFromHistory() {
  try { return buildSeenState(getSessionHistory()) } catch { return EMPTY_SEEN_STATE }
}

/**
 * Ensures a question has exactly 4 options labeled A–D.
 * @param {object} q
 * @returns {import('./quizTypes').QuizQuestion}
 */
export function normalizeQuestion(q) {
  const letters = ['A', 'B', 'C', 'D']
  const opts = (q.options || []).slice(0, 4).map((o, i) => ({
    letter: letters[i],
    text: typeof o === 'string' ? o : (o?.text ?? ''),
  }))
  // Support q.correctAnswer (AI-generated) or q.correct (mock), numeric or letter
  const raw = q.correctAnswer ?? q.correct
  const correct = letters.includes(raw) ? raw
    : typeof raw === 'number' ? (letters[raw] || 'A')
    : 'A'
  return { ...q, options: opts, correct }
}

// Only these 10 questions have full optionExplanations for Coach Mode.
const ENRICHED_IDS = new Set(['q001', 'q002', 'q003', 'q004', 'q007', 'q010', 'q012', 'q016', 'q018', 'q020', 'qLD001', 'qLD002', 'qLD003'])


/** @type {import('./quizTypes').QuizQuestion[]} */
const QUESTION_BANK = [
  {
    id: 'q001',
    subject: 'Physiology',
    system: 'Cardiovascular',
    difficulty: 'Balanced',
    testedConcept: 'Type B aortic dissection — subclavian compression',
    weakSpotCategory: 'Cardiovascular Emergencies',
    memoryAnchor: 'BP gap >20 mmHg between arms = dissection flag. Type B starts DISTAL to left subclavian.',
    commonTrap: 'Students choose atherosclerotic brachial occlusion because it also reduces arm flow — but atherosclerosis is chronic and cannot explain an acute BP asymmetry in a patient with known dissection on CT.',
    stem: 'A 68-year-old man with hypertension presents with sudden tearing chest pain radiating to his back. Blood pressure is 180/110 mmHg in the right arm and 140/90 mmHg in the left arm. CT angiography shows dissection starting just distal to the left subclavian artery. Which of the following best explains the blood pressure difference between arms?',
    options: [
      { letter: 'A', text: 'Compression of the left subclavian artery by the dissection flap' },
      { letter: 'B', text: 'Atherosclerotic occlusion of the left brachial artery' },
      { letter: 'C', text: 'Reflex vasodilation of left upper extremity vasculature' },
      { letter: 'D', text: 'Increased cardiac output to the right subclavian territory' },
    ],
    correct: 'A',
    explanation: 'Type B aortic dissection begins distal to the left subclavian artery. The dissection flap can compress the left subclavian origin, reducing left arm perfusion and causing a measurable blood pressure differential. A difference >20 mmHg between arms is a classic clinical sign of aortic dissection.',
    pearl: 'BP difference >20 mmHg between arms = red flag for aortic dissection. Always use CT angiography — not ultrasound — when dissection is suspected.',
    optionExplanations: {
      A: 'Type B dissection begins just distal to the left subclavian takeoff, meaning the dissection flap can partially or completely obstruct left subclavian origin flow, reducing left arm perfusion and lowering blood pressure. A >20 mmHg bilateral differential is the defining red flag sign of aortic dissection and is explained by this exact mechanical obstruction.',
      B: 'Atherosclerotic brachial occlusion can reduce distal arm perfusion, but this is a chronic, progressive process — not an acute finding in a patient presenting with sudden tearing pain and a dissection confirmed on CT. The temporal relationship (acute onset) and CT findings directly exclude this explanation.',
      C: 'Reflex vasodilation is a downstream response to ischemia, not a primary driver of BP asymmetry. No reflex mechanism would selectively dilate one extremity enough to create a 40 mmHg bilateral pressure difference in the acute setting described here.',
      D: 'Cardiac output distributes bilaterally via the aorta and both subclavian arteries symmetrically. There is no mechanism by which the heart selectively increases output to only the right subclavian without a structural obstruction — like the dissection flap — explaining the asymmetry.',
    },
  },
  {
    id: 'q002',
    subject: 'Pathology',
    system: 'Cardiovascular',
    difficulty: 'Balanced',
    testedConcept: 'Cor pulmonale — hypoxic pulmonary vasoconstriction mechanism',
    weakSpotCategory: 'Pulmonary Hypertension Mechanisms',
    memoryAnchor: 'COPD → chronic hypoxia → HPV → pulmonary HTN → RV strain = cor pulmonale. WHO Group 3.',
    commonTrap: 'Students pick LV failure because bilateral leg edema suggests left-sided failure, but the normal LV on echo and hyperinflation on CXR indicate RV overload from lung disease — not retrograde LHF.',
    stem: 'A 55-year-old man with a 30 pack-year smoking history presents with dyspnea and bilateral leg edema. Echocardiography shows right ventricular hypertrophy and estimated pulmonary artery systolic pressure of 60 mmHg. Chest X-ray shows hyperinflation. What is the most likely mechanism for his cardiac findings?',
    options: [
      { letter: 'A', text: 'Chronic hypoxic vasoconstriction increasing pulmonary vascular resistance' },
      { letter: 'B', text: 'Left ventricular failure causing retrograde pulmonary hypertension' },
      { letter: 'C', text: 'Primary pulmonary arterial hypertension from an idiopathic mutation' },
      { letter: 'D', text: 'Recurrent pulmonary emboli obliterating the vascular bed' },
    ],
    correct: 'A',
    explanation: 'COPD causes chronic alveolar hypoxia, triggering hypoxic pulmonary vasoconstriction. Sustained vasoconstriction leads to irreversible vascular remodeling, pulmonary hypertension, and right ventricular hypertrophy (cor pulmonale). This is WHO Group 3 secondary pulmonary hypertension.',
    pearl: 'Cor pulmonale = RV failure from lung disease. Key mechanism: hypoxia → vasoconstriction → pulmonary HTN → RV overload.',
    optionExplanations: {
      A: 'COPD destroys alveolar architecture and causes chronic alveolar hypoxia. Hypoxic pulmonary vasoconstriction is protective initially, but sustained hypoxia drives vascular remodeling — smooth muscle hypertrophy and intimal thickening — creating fixed pulmonary hypertension. This RV pressure overload (WHO Group 3 PH) explains the RVH and elevated PASP on echo.',
      B: 'LV failure (WHO Group 2 PH) elevates pulmonary venous pressure, backing up into the pulmonary arterial system. However, the clinical picture here — hyperinflation on CXR, 30 pack-year history, RVH without LV dysfunction on echo — points to lung disease as the primary driver, not left-sided heart failure.',
      C: 'Primary PAH (WHO Group 1) is idiopathic or heritable (BMPR2 mutations), typically affecting young women without underlying lung disease. The 30 pack-year smoking history and CXR hyperinflation point overwhelmingly toward COPD-related secondary PH, not an idiopathic primary process.',
      D: 'Chronic thromboembolic PH (WHO Group 4) requires a history of recurrent pulmonary emboli and characteristic imaging showing organized thrombus. This patient has no such history, and the COPD explanation accounts for all findings more parsimoniously.',
    },
  },
  {
    id: 'q003',
    subject: 'Pharmacology',
    system: 'Cardiovascular',
    difficulty: 'Balanced',
    testedConcept: 'HFrEF pharmacotherapy — ARNI mechanism and reverse remodeling',
    weakSpotCategory: 'Heart Failure Pharmacology',
    memoryAnchor: 'ARNI = sacubitril/valsartan. The 4 pillars of HFrEF: ARNI + beta-blocker + MRA + SGLT2i.',
    commonTrap: 'Students pick digoxin because it improves symptoms and CO in HF, but digoxin has no mortality benefit and does not structurally improve EF — only reverse remodeling agents like ARNI do.',
    stem: 'A 62-year-old woman with heart failure (EF 30%) is started on a new agent. Over 3 months her EF improves to 45% and BNP decreases significantly. She denies side effects. Which drug class most likely accounts for this improvement?',
    options: [
      { letter: 'A', text: 'Angiotensin receptor-neprilysin inhibitor (ARNI)' },
      { letter: 'B', text: 'Thiazide diuretic' },
      { letter: 'C', text: 'Dihydropyridine calcium channel blocker' },
      { letter: 'D', text: 'Cardiac glycoside (digoxin)' },
    ],
    correct: 'A',
    explanation: 'Sacubitril/valsartan (ARNI) inhibits neprilysin, preventing natriuretic peptide breakdown, while blocking angiotensin II. The PARADIGM-HF trial showed superiority over enalapril in reducing cardiovascular death and HF hospitalization, with demonstrated improvement in ejection fraction over time.',
    pearl: 'ARNIs are first-line for HFrEF alongside beta-blockers, MRAs, and SGLT2 inhibitors — the "fantastic four" of modern heart failure therapy.',
    optionExplanations: {
      A: 'Sacubitril/valsartan combines neprilysin inhibition (increasing natriuretic peptide bioavailability, promoting vasodilation and diuresis) with AT1 receptor blockade. Together these reduce cardiac filling pressures and neurohormonal activation. PARADIGM-HF demonstrated structural EF improvement and reverse ventricular remodeling over time — the only drug class matching the clinical scenario described.',
      B: 'Thiazide diuretics reduce preload through volume removal, which can symptomatically improve fluid-overloaded HF patients, but they do not reverse ventricular remodeling or structurally improve ejection fraction. They are not first-line for HFrEF and carry no mortality benefit in this context.',
      C: 'Dihydropyridine CCBs (amlodipine, felodipine) are generally avoided in HFrEF because they can worsen cardiac output through reflex tachycardia and have negative inotropic effects. They do not improve EF and are never first-line in HFrEF management.',
      D: 'Digoxin increases inotropy via Na/K-ATPase inhibition and slows heart rate, improving symptoms and exercise tolerance. However, the DIG trial showed no mortality benefit, and digoxin does not cause structural EF improvement — the scenario\'s 30% to 45% improvement implies true reverse remodeling, not just symptom control.',
    },
  },
  {
    id: 'q004',
    subject: 'Physiology',
    system: 'Respiratory',
    difficulty: 'Balanced',
    testedConcept: 'Acid-base: acute vs. chronic respiratory acidosis — compensation formulas',
    weakSpotCategory: 'Acid-Base Physiology',
    memoryAnchor: 'Acute RespAcid: HCO3 +1 per 10 PaCO2. Chronic: +3.5 per 10. Normal HCO3 + high CO2 = ACUTE.',
    commonTrap: 'Students pick chronic because HCO3 of 26 looks slightly elevated, but expected chronic HCO3 for PaCO2 68 would be ~32 — the near-normal HCO3 confirms this is acute, not chronic.',
    stem: 'A 35-year-old man is found unresponsive after opioid ingestion. RR is 6/min, SpO2 84%. ABG: pH 7.22, PaCO2 68 mmHg, PaO2 48 mmHg, HCO3 26 mEq/L. Which best describes this acid-base disturbance?',
    options: [
      { letter: 'A', text: 'Acute respiratory acidosis' },
      { letter: 'B', text: 'Chronic respiratory acidosis with metabolic compensation' },
      { letter: 'C', text: 'Mixed metabolic and respiratory acidosis' },
      { letter: 'D', text: 'Respiratory alkalosis with metabolic compensation' },
    ],
    correct: 'A',
    explanation: 'Low pH + elevated PaCO2 = respiratory acidosis. HCO3 26 mEq/L is near normal. In acute respiratory acidosis, HCO3 increases 1 mEq/L per 10 mmHg rise in PaCO2 (expected ≈27 here), consistent with acute compensation. Chronic respiratory acidosis would show HCO3 rising 3.5 mEq/L per 10 mmHg.',
    pearl: 'Acute respiratory acidosis: HCO3 rises 1 per 10 PaCO2. Chronic: rises 3.5 per 10. Opioids → hypoventilation → CO2 retention → respiratory acidosis.',
    optionExplanations: {
      A: 'pH 7.22 is acidotic and PaCO2 68 is elevated — this is respiratory acidosis. The HCO3 of 26 mEq/L is slightly above 22, consistent with the acute renal buffer response (+1 mEq per 10 mmHg rise in PaCO2). For PaCO2 68, the expected HCO3 is approximately 22 + 2.8 ≈ 25–27 mEq/L, matching perfectly. Opioid-induced respiratory depression is the classic cause.',
      B: 'Chronic respiratory acidosis allows full renal compensation, raising HCO3 by ~3.5 mEq/L per 10 mmHg PaCO2. For PaCO2 68, expected chronic HCO3 would be approximately 22 + 9.8 ≈ 32 mEq/L. The observed HCO3 of 26 falls far below this expected value, making chronic compensation impossible — this is clearly an acute process.',
      C: 'Mixed respiratory and metabolic acidosis would require both elevated PaCO2 AND a lower-than-expected HCO3 — indicating two separate acid-generating processes occurring simultaneously. Here HCO3 is appropriate for acute respiratory acidosis alone, not additionally depressed, so there is no metabolic component.',
      D: 'Respiratory alkalosis requires low PaCO2 from hyperventilation. This patient has PaCO2 of 68 mmHg — markedly elevated — which by definition excludes alkalosis entirely. This distractor tests whether students can correctly read an ABG without misidentifying the primary process.',
    },
  },
  {
    id: 'q005',
    subject: 'Pathology',
    system: 'Respiratory',
    difficulty: 'NBME Difficult',
    testedConcept: 'UIP / IPF — biopsy features (temporal heterogeneity, fibroblastic foci)',
    weakSpotCategory: 'Interstitial Lung Disease',
    memoryAnchor: 'UIP/IPF: Temporal heterogeneity + fibroblastic foci + honeycombing. Basal-subpleural on CT. Restrictive PFTs.',
    commonTrap: 'Students pick NSIP because it also causes bilateral fibrosis and restrictive disease, but NSIP shows temporal homogeneity (uniform fibrosis) — temporal heterogeneity with fibroblastic foci is the key UIP differentiator.',
    stem: 'A 52-year-old woman with progressive dyspnea over 2 years has PFTs showing reduced FVC, reduced TLC, and normal FEV1/FVC ratio. CT shows bilateral basal reticular opacities with honeycombing. Biopsy shows temporally heterogeneous fibrosis with fibroblastic foci. What is the most likely diagnosis?',
    options: [
      { letter: 'A', text: 'Usual interstitial pneumonia pattern (IPF)' },
      { letter: 'B', text: 'Nonspecific interstitial pneumonia (NSIP)' },
      { letter: 'C', text: 'Cryptogenic organizing pneumonia (COP)' },
      { letter: 'D', text: 'Hypersensitivity pneumonitis' },
    ],
    correct: 'A',
    explanation: 'IPF has the UIP pattern on biopsy: temporal heterogeneity (old and new fibrosis coexisting), fibroblastic foci (active scarring at the leading edge), and honeycomb change. CT shows basal-subpleural predominance. PFTs are restrictive. Prognosis is poor (median survival 3–5 years). Antifibrotic therapy (pirfenidone or nintedanib) slows progression.',
    pearl: 'UIP/IPF: temporal heterogeneity + fibroblastic foci + honeycomb (basal-subpleural on CT). Restrictive PFTs. Treat with pirfenidone or nintedanib.',
  },
  {
    id: 'q006',
    subject: 'Physiology',
    system: 'Renal / Urinary',
    difficulty: 'Balanced',
    testedConcept: 'Pyelonephritis — mechanism of acute creatinine elevation (prerenal)',
    weakSpotCategory: 'AKI Classification',
    memoryAnchor: 'Pyelonephritis + elevated Cr = prerenal most common (dehydration + fever-induced vasodilation). IV fluids restore renal function.',
    commonTrap: 'Students pick intrinsic renal injury from bacterial toxins because the kidney is clearly infected, but direct tubular toxin injury is uncommon in uncomplicated pyelonephritis — prerenal from reduced intake and vasodilation is the dominant mechanism.',
    stem: 'A 24-year-old woman with recurrent UTIs presents with 3 days of dysuria, urinary frequency, and right flank pain with fever 38.9°C. UA shows leukocyte esterase and nitrites positive. Creatinine is 1.8 mg/dL (baseline 0.8). BP is 118/76. Which mechanism best explains the creatinine elevation?',
    options: [
      { letter: 'A', text: 'Prerenal azotemia from fever-induced vasodilation and reduced oral intake' },
      { letter: 'B', text: 'Intrinsic renal injury from direct bacterial tubular toxins' },
      { letter: 'C', text: 'Obstructive uropathy from inflammatory ureteral compression' },
      { letter: 'D', text: 'Immune complex glomerulonephritis triggered by the infection' },
    ],
    correct: 'A',
    explanation: 'In acute pyelonephritis, fever-induced systemic vasodilation, decreased oral intake, and the inflammatory response reduce effective circulating volume, impairing renal perfusion. This prerenal mechanism is responsible for most creatinine elevation. BUN:Cr ratio is typically >20. IV fluids and antibiotics normalize renal function in most cases.',
    pearl: 'Acute pyelonephritis raises creatinine mainly through prerenal mechanisms. Always give IV fluids alongside antibiotics. Intrinsic AKI can occur but is less common.',
  },
  {
    id: 'q007',
    subject: 'Pathology',
    system: 'Renal / Urinary',
    difficulty: 'NBME Difficult',
    testedConcept: 'Post-streptococcal GN — immune complex mechanism and alternative complement pathway',
    weakSpotCategory: 'Glomerulopathy Classification',
    memoryAnchor: 'PSGN = subepithelial humps on EM + low C3, normal C4 = alternative complement pathway. 1–3 weeks post-pharyngitis.',
    commonTrap: 'Students pick IgA nephropathy because it also follows infection, but IgA deposition is mesangial and occurs hours to days after mucosal infection — not 3 weeks post-pharyngitis with subepithelial humps.',
    stem: 'A 19-year-old man presents with cola-colored urine, periorbital edema, and hypertension 3 weeks after a sore throat. UA shows RBC casts and proteinuria. C3 is low, C4 is normal. ASO titer is elevated. Biopsy shows subepithelial electron-dense "humps." Which immune mechanism best explains this finding?',
    options: [
      { letter: 'A', text: 'Deposition of streptococcal antigen-antibody complexes in the subepithelial space' },
      { letter: 'B', text: 'Anti-GBM antibodies cross-reacting with type IV collagen' },
      { letter: 'C', text: 'T cell-mediated cytotoxic injury to podocytes' },
      { letter: 'D', text: 'IgA complex deposition in the mesangium following mucosal infection' },
    ],
    correct: 'A',
    explanation: 'Post-streptococcal GN: streptococcal cationic antigens migrate to the subepithelial space and are bound by circulating antibodies forming immune complexes (the "humps"). This activates complement via the alternative pathway, consuming C3 while C4 stays normal. Presents 1–3 weeks post-pharyngitis, nephritic syndrome, excellent prognosis in children.',
    pearl: 'PSGN: subepithelial humps on EM, low C3 normal C4 (alternative pathway). 1–3 weeks post-pharyngitis, 3–6 weeks post-impetigo. Excellent prognosis in children.',
    optionExplanations: {
      A: 'Nephritogenic streptococcal antigens (nephritis-associated plasmin receptor, streptokinase) migrate to the subepithelial space — between podocytes and the outer GBM surface — and are bound by circulating antibodies in situ. This forms the characteristic "humps" visible on electron microscopy. The resulting immune complexes activate complement via the alternative pathway, consuming C3 while sparing C4.',
      B: 'Anti-GBM disease (Goodpasture syndrome) involves IgG antibodies targeting the alpha-3 chain of type IV collagen in the GBM, producing LINEAR IgG deposits on immunofluorescence — not granular subepithelial humps. It causes rapidly progressive GN with pulmonary hemorrhage and has no temporal relationship to streptococcal infection.',
      C: 'T cell-mediated podocyte injury is the mechanism of minimal change disease, which presents as nephrotic syndrome (massive proteinuria, edema, hypoalbuminemia) — not nephritic syndrome with RBC casts and hematuria. Electron microscopy in MCD shows diffuse podocyte foot process effacement without immune deposits.',
      D: 'IgA nephropathy (Berger disease) is triggered by mucosal infections and typically presents within hours to days after an upper respiratory illness — a much shorter latency than PSGN\'s 1–3 weeks. IgA deposits in the MESANGIUM, not subepithelially, and complement is typically normal. It is the most common glomerulopathy worldwide but does not show subepithelial humps.',
    },
  },
  {
    id: 'q008',
    subject: 'Physiology',
    system: 'Gastrointestinal',
    difficulty: 'Balanced',
    testedConcept: 'SAAG calculation and interpretation for ascites etiology',
    weakSpotCategory: 'Hepatology / Ascites',
    memoryAnchor: 'SAAG = Serum albumin − Ascitic fluid albumin. ≥1.1 = portal HTN. <1.1 = exudate (malignancy, TB).',
    commonTrap: 'Students add instead of subtract (getting 2.9) or correctly compute 1.3 but misinterpret it as exudate — the SAAG ≥1.1 threshold always means portal hypertension.',
    stem: 'A 45-year-old man with alcoholic cirrhosis has increasing abdominal distension. Paracentesis yields straw-colored fluid. Serum albumin is 2.1 g/dL; ascitic fluid albumin is 0.8 g/dL. Which of the following correctly interprets the SAAG?',
    options: [
      { letter: 'A', text: 'SAAG = 1.3 g/dL; indicates portal hypertension' },
      { letter: 'B', text: 'SAAG = 1.3 g/dL; indicates exudative cause such as malignancy' },
      { letter: 'C', text: 'SAAG = 2.9 g/dL; indicates portal hypertension' },
      { letter: 'D', text: 'SAAG = 2.9 g/dL; indicates exudative ascites' },
    ],
    correct: 'A',
    explanation: 'SAAG = serum albumin − ascitic fluid albumin = 2.1 − 0.8 = 1.3 g/dL. A SAAG ≥ 1.1 g/dL indicates portal hypertension (97% accuracy). Causes include cirrhosis, heart failure, and Budd-Chiari. SAAG < 1.1 indicates exudative ascites (malignancy, TB peritonitis, pancreatitis).',
    pearl: 'SAAG formula: serum albumin − ascites albumin. ≥1.1 → portal HTN (cirrhosis, CHF, Budd-Chiari). <1.1 → exudate (malignancy, TB). Not the same as Light\'s criteria.',
  },
  {
    id: 'q009',
    subject: 'Pathology',
    system: 'Gastrointestinal',
    difficulty: 'Balanced',
    testedConcept: "Crohn's disease — transmural inflammation and fistula formation",
    weakSpotCategory: 'Inflammatory Bowel Disease',
    memoryAnchor: "Crohn's = TRANSMURAL = fistulas + strictures + skip lesions. UC = MUCOSAL = no fistulas, continuous from rectum.",
    commonTrap: "Students pick PSC because it is associated with IBD, but PSC is more strongly associated with UC than Crohn's — the question asks what is most specific to Crohn's vs. UC.",
    stem: 'A 32-year-old woman has recurrent abdominal pain, diarrhea, and weight loss. Colonoscopy shows segmental skip lesions from terminal ileum to cecum with cobblestone mucosa and linear ulcers. Biopsy shows non-caseating granulomas. Which complication is most specific to this disease compared to ulcerative colitis?',
    options: [
      { letter: 'A', text: 'Fistula formation to skin, bladder, or adjacent bowel loops' },
      { letter: 'B', text: 'Toxic megacolon with transmural inflammation' },
      { letter: 'C', text: 'Primary sclerosing cholangitis' },
      { letter: 'D', text: 'Increased colorectal carcinoma risk with pancolitis' },
    ],
    correct: 'A',
    explanation: "Crohn's disease is transmural (full-thickness inflammation), which allows fistulas to develop between bowel and adjacent structures — enterocutaneous, enterovesical, enterovaginal, or enteroenteric. UC is limited to mucosa/submucosa and does not form fistulas. Toxic megacolon and PSC are more classically associated with UC. CRC risk is higher with UC pancolitis.",
    pearl: "Crohn's = TRANSMURAL → fistulas, strictures, skip lesions, terminal ileum. UC = MUCOSAL → continuous from rectum → pseudopolyps, toxic megacolon, higher CRC risk.",
  },
  {
    id: 'q010',
    subject: 'Physiology',
    system: 'Endocrine',
    difficulty: 'Balanced',
    testedConcept: "Graves' disease — TSI mechanism and TSH receptor stimulation",
    weakSpotCategory: 'Thyroid Autoimmune Disease',
    memoryAnchor: "Graves' = TSI mimic TSH → receptor always ON → undetectable TSH + high T4. Triad: goiter + hyperthyroid + exophthalmos.",
    commonTrap: 'Students pick anti-TPO (D) because it is associated with thyroid autoimmune disease, but anti-TPO is the marker of Hashimoto thyroiditis (hypothyroid) — TPO is an enzyme, not a receptor for TSI.',
    stem: 'A 28-year-old woman has anxiety, heat intolerance, weight loss despite increased appetite, and palpitations. TSH is 0.01 mIU/L and free T4 is elevated. She has a diffusely enlarged thyroid, mild proptosis, and elevated thyroid-stimulating immunoglobulin (TSI). Which receptor do these antibodies stimulate?',
    options: [
      { letter: 'A', text: 'TSH receptor on thyroid follicular cells' },
      { letter: 'B', text: 'T3 receptor on orbital fibroblasts causing proptosis directly' },
      { letter: 'C', text: 'Thyroglobulin receptor in the thyroid colloid' },
      { letter: 'D', text: 'Thyroid peroxidase receptor on the follicular epithelium' },
    ],
    correct: 'A',
    explanation: "Graves' disease is caused by IgG antibodies (TSI/TRAb) that bind and continuously stimulate the TSH receptor on follicular cells, driving autonomous T3/T4 synthesis without feedback suppression. The pituitary detects elevated thyroid hormones and suppresses TSH to near-zero. Proptosis results from glycosaminoglycan deposition in orbital tissues, not direct antibody action there.",
    pearl: "Graves': TSI stimulate TSH receptor → autonomous hormone production. Classic triad: hyperthyroidism + diffuse goiter + exophthalmos. Anti-TPO/anti-Tg = Hashimoto's (hypothyroid).",
    optionExplanations: {
      A: 'TSI (thyroid-stimulating immunoglobulin) are IgG autoantibodies that structurally mimic TSH and bind the TSH receptor on thyroid follicular cell basolateral membranes. This activates adenylyl cyclase, increases cAMP, and drives constitutive T3/T4 synthesis independent of pituitary regulation. The pituitary detects excess thyroid hormone and suppresses TSH to near-zero — creating the classic lab pattern of undetectable TSH with elevated free T4.',
      B: "Proptosis in Graves' disease results from orbital fibroblast activation and glycosaminoglycan (hyaluronate) deposition in the retro-orbital space — these fibroblasts do express TSH receptors and are activated by TSI. However, the antibodies still act via the TSH receptor (not a separate T3 receptor), and proptosis is a downstream effect of orbital TSH receptor stimulation, not direct T3 receptor activation.",
      C: 'Thyroglobulin is a storage protein in the thyroid colloid, not a cell-surface receptor. Anti-thyroglobulin antibodies exist in autoimmune thyroid disease (both Graves\' and Hashimoto\'s) but are not the antibodies driving hyperthyroidism. The stimulating antibodies in Graves\' specifically target the TSH receptor on the basolateral surface of follicular cells.',
      D: 'Thyroid peroxidase (TPO) is the enzyme responsible for organification of iodide and coupling of iodotyrosines during thyroid hormone synthesis — it is an enzyme, not a receptor. Anti-TPO antibodies are the hallmark serologic marker of Hashimoto thyroiditis (which causes hypothyroidism through gland destruction), not Graves\' disease. Anti-TPO does not stimulate hormone secretion.',
    },
  },
  {
    id: 'q011',
    subject: 'Pharmacology',
    system: 'Endocrine',
    difficulty: 'Balanced',
    testedConcept: 'T2DM + HFrEF pharmacotherapy — SGLT2 inhibitor proven CV benefit',
    weakSpotCategory: 'Cardio-Metabolic Pharmacology',
    memoryAnchor: 'T2DM + HFrEF = SGLT2i (empagliflozin). T2DM + ASCVD = GLP-1 RA (liraglutide/semaglutide). Know the indication.',
    commonTrap: 'Students pick twice-daily exenatide because GLP-1 RAs have CV benefit in T2DM — but ONLY weekly semaglutide and liraglutide showed CV benefit. Twice-daily exenatide (EXSCEL) specifically did NOT.',
    stem: 'A 58-year-old man with T2DM has HbA1c 8.9% on metformin. eGFR is 72. He has HFrEF. Which agent is MOST appropriate to add for glycemic control with proven cardiovascular benefit?',
    options: [
      { letter: 'A', text: 'Empagliflozin (SGLT2 inhibitor)' },
      { letter: 'B', text: 'Sitagliptin (DPP-4 inhibitor)' },
      { letter: 'C', text: 'Exenatide twice-daily (GLP-1 receptor agonist)' },
      { letter: 'D', text: 'Glipizide (sulfonylurea)' },
    ],
    correct: 'A',
    explanation: 'SGLT2 inhibitors have proven CV and renal benefits. For HFrEF specifically, they reduce hospitalization and cardiovascular death regardless of diabetes status. Empagliflozin is appropriate at eGFR ≥20. DPP-4 inhibitors are cardio-neutral. Twice-daily exenatide did not show CV benefit (unlike liraglutide/semaglutide). Sulfonylureas carry hypoglycemia risk and no CV benefit.',
    pearl: 'T2DM + HFrEF → SGLT2 inhibitor (reduces HF hospitalization). T2DM + ASCVD → GLP-1 RA (liraglutide or semaglutide). These two scenarios are high-yield and distinct.',
  },
  {
    id: 'q012',
    subject: 'Neurology',
    system: 'Neurology',
    difficulty: 'Balanced',
    testedConcept: 'Pontine stroke localization — Millard-Gubler syndrome (CN VI + VII ipsilateral, contralateral hemiplegia)',
    weakSpotCategory: 'CNS Localization',
    memoryAnchor: 'Pons: CN VI + CN VII ipsilateral + contralateral limb weakness = Millard-Gubler. Corticospinal crosses in medulla, NOT pons.',
    commonTrap: 'Students pick CN III (midbrain) because they associate eye movement problems with CN III — but CN III is in the midbrain, and a pontine lesion cannot damage it. Also, CN III palsy causes ipsilateral eye deviation, not abduction failure.',
    stem: 'A 72-year-old man has sudden right-sided weakness, right facial droop, slurred speech, and inability to abduct his left eye. MRI shows a lesion in the left pons. Which cranial nerve nucleus is most likely damaged to explain the eye finding?',
    options: [
      { letter: 'A', text: 'CN VI (abducens) nucleus in the left pons' },
      { letter: 'B', text: 'CN III (oculomotor) nucleus in the left midbrain' },
      { letter: 'C', text: 'CN IV (trochlear) nucleus in the left midbrain' },
      { letter: 'D', text: 'Medial longitudinal fasciculus in the right pons' },
    ],
    correct: 'A',
    explanation: 'This is Millard-Gubler syndrome (ventral pontine): left CN VI nucleus damage causes ipsilateral lateral rectus palsy (cannot abduct left eye), plus left CN VII damage causes left facial droop. The corticospinal tract is already crossed by the time it reaches the pons, so a left pontine lesion causes contralateral (right) hemiplegia.',
    pearl: 'Pontine stroke: ipsilateral CN VI + CN VII palsy + CONTRALATERAL hemiplegia = Millard-Gubler. Corticospinal tract crosses in the medulla — pontine lesions cause contralateral limb weakness, ipsilateral CN findings.',
    optionExplanations: {
      A: 'The CN VI (abducens) nucleus is located in the dorsal pons. A left pontine lesion damages the left CN VI nucleus, preventing left lateral rectus contraction and abduction of the left eye — the ipsilateral CN finding. The right arm weakness and right facial droop result from corticospinal and corticobulbar tract damage; these tracts have already crossed below the pons, making pontine lesions produce contralateral limb weakness with ipsilateral cranial nerve signs.',
      B: 'CN III (oculomotor) nucleus resides in the midbrain tegmentum — anatomically distant from the pons. A pontine lesion cannot damage CN III. CN III palsy causes ipsilateral ptosis, a down-and-out eye (SR, MR, IR, IO weakness), and a fixed dilated pupil — not failure to abduct. This tests knowledge of brainstem level anatomy.',
      C: 'CN IV (trochlear) nucleus is also in the midbrain, not the pons. CN IV palsy causes vertical diplopia — specifically trouble looking down and in (superior oblique weakness) — not horizontal abduction failure. A left pontine lesion would not affect CN IV, and the symptom pattern described does not fit trochlear palsy.',
      D: 'Internuclear ophthalmoplegia (INO) results from MLF damage, which prevents the adducting eye from crossing midline during contralateral lateral gaze. A left MLF lesion would cause right INO (failure of right adduction on leftward gaze). Critically, INO affects ADDUCTION (medial rectus), not ABDUCTION — the question describes inability to ABDUCT the left eye, which localizes to CN VI, not the MLF.',
    },
  },
  {
    id: 'q013',
    subject: 'Neurology',
    system: 'Neurology',
    difficulty: 'Balanced',
    testedConcept: 'Multiple sclerosis — McDonald criteria: disseminated in space and time',
    weakSpotCategory: 'Demyelinating Disease',
    memoryAnchor: 'MS = DIS + DIT (Disseminated In Space + Time). Periventricular lesions = Dawson fingers. Oligoclonal bands in CSF.',
    commonTrap: 'Students pick NMO because it also affects the optic nerve, but NMO attacks are more severe, target spinal cord and optic nerves predominantly, require AQP4-IgG, and do NOT produce periventricular lesions like MS.',
    stem: 'A 25-year-old woman had sudden left eye visual loss 6 months ago (resolved). Now she has right arm weakness and sensory changes. MRI shows periventricular white matter lesions. CSF reveals oligoclonal IgG bands. What is the most likely diagnosis?',
    options: [
      { letter: 'A', text: 'Multiple sclerosis' },
      { letter: 'B', text: 'Neuromyelitis optica (NMO)' },
      { letter: 'C', text: 'Acute disseminated encephalomyelitis (ADEM)' },
      { letter: 'D', text: 'CNS vasculitis' },
    ],
    correct: 'A',
    explanation: 'MS requires demyelinating lesions disseminated in space (different CNS locations: optic nerve + arm corticospinal/sensory tracts) and time (attacks ≥30 days apart). Periventricular lesions and CSF oligoclonal bands are classic. NMO (AQP4-IgG+) causes more severe attacks predominantly of optic nerves and spinal cord. ADEM is monophasic.',
    pearl: 'MS: disseminated in SPACE + TIME. Periventricular (Dawson fingers), juxtacortical, infratentorial MRI lesions. CSF: oligoclonal bands, elevated IgG index.',
  },
  {
    id: 'q014',
    subject: 'Microbiology',
    system: 'Infectious Disease',
    difficulty: 'Balanced',
    testedConcept: 'N. meningitidis — polysaccharide capsule as primary virulence factor',
    weakSpotCategory: 'Bacterial Virulence Mechanisms',
    memoryAnchor: 'N. meningitidis: CAPSULE = primary virulence (antiphagocytic, vaccine target). Gram-neg diplococci. Purpuric rash = DIC from endotoxin (downstream).',
    commonTrap: 'Students pick lipid A endotoxin because the purpuric DIC rash is so visually striking, but the question asks about primary pathogenicity — the capsule enables survival and dissemination; endotoxin mediates the rash but is downstream.',
    stem: 'A 3-year-old boy has high fever, stiff neck, photophobia, and a rapidly progressive petechial-purpuric rash. LP: WBC 2400 (90% PMNs), glucose 20 mg/dL, protein 180 mg/dL. Gram stain shows gram-negative diplococci. Which virulence mechanism is primarily responsible for this organism\'s pathogenicity?',
    options: [
      { letter: 'A', text: 'Antiphagocytic polysaccharide capsule resisting complement-mediated killing' },
      { letter: 'B', text: 'Lipid A endotoxin causing the purpuric rash and septic shock' },
      { letter: 'C', text: 'IgA protease facilitating nasopharyngeal colonization' },
      { letter: 'D', text: 'Protein A binding the Fc region of IgG to prevent opsonization' },
    ],
    correct: 'A',
    explanation: 'Neisseria meningitidis causes this picture (meningitis + Waterhouse-Friderichsen). Its primary virulence factor is the polysaccharide capsule, which inhibits phagocytosis and complement-mediated killing. The capsule is also the target of meningococcal vaccines. Lipid A drives the endotoxemia/DIC, but the capsule is the primary virulence factor. Protein A is a Staph aureus feature.',
    pearl: 'N. meningitidis: capsule = primary virulence (antiphagocytic, vaccine target). Serogroups B, C, W, Y, A. Purpuric rash = meningococcemia + DIC. Give empiric ceftriaxone + dexamethasone.',
  },
  {
    id: 'q015',
    subject: 'Microbiology',
    system: 'Infectious Disease',
    difficulty: 'Balanced',
    testedConcept: 'Disseminated MAC in AIDS — CD4 threshold and diagnostic features',
    weakSpotCategory: 'HIV/AIDS Opportunistic Infections',
    memoryAnchor: 'CD4 thresholds: <200 PCP, <100 toxo/crypto, <50 MAC+CMV. MAC = blood cultures positive, NO pulmonary infiltrates on CXR.',
    commonTrap: 'Students pick MTB because both MAC and MTB are acid-fast and cause constitutional symptoms — but TB in AIDS produces pulmonary infiltrates on CXR, which are absent here, and MAC is specifically the disseminated blood-culture-positive form at CD4 <50.',
    stem: 'A 35-year-old woman with HIV (CD4 45/µL) has 3 weeks of fever, weight loss, night sweats, and diarrhea. Blood cultures at 37°C grow acid-fast organisms. CXR shows no focal consolidation. Which pathogen is most likely?',
    options: [
      { letter: 'A', text: 'Mycobacterium avium complex (MAC)' },
      { letter: 'B', text: 'Mycobacterium tuberculosis' },
      { letter: 'C', text: 'Mycobacterium kansasii' },
      { letter: 'D', text: 'Pneumocystis jirovecii' },
    ],
    correct: 'A',
    explanation: 'MAC is the most common disseminated opportunistic mycobacterial infection in AIDS when CD4 <50/µL. It presents with fever, diarrhea, hepatosplenomegaly, and lymphadenopathy. Blood cultures are diagnostic. M. tuberculosis would produce pulmonary infiltrates on CXR. P. jirovecii causes PCP and is not acid-fast. Treat MAC with clarithromycin + ethambutol ± rifabutin.',
    pearl: 'CD4 thresholds: <200 → PCP; <100 → Toxoplasma, Cryptosporidium; <50 → MAC, CMV retinitis. MAC = blood culture positive, no CXR findings, CD4 <50. Prophylaxis with azithromycin.',
  },
  {
    id: 'q016',
    subject: 'Pharmacology',
    system: 'Neurology',
    difficulty: 'Balanced',
    testedConcept: 'Antiepileptic drug teratogenicity — valproate and neural tube defects',
    weakSpotCategory: 'Pharmacology in Pregnancy',
    memoryAnchor: 'VAlproate = Very Awful for fetus → neural tube defects (spina bifida). Give high-dose folic acid. Phenytoin = hydantoin syndrome. Lithium = Ebstein anomaly.',
    commonTrap: 'Students pick fetal hydantoin syndrome because it is a well-known AED teratogen example, but hydantoin syndrome is caused by PHENYTOIN — not valproate. Two different drugs, two completely different teratogenic profiles.',
    stem: 'A 28-year-old woman with well-controlled generalized tonic-clonic seizures on valproic acid is planning a pregnancy. She asks about fetal risks. What is the most serious fetal risk associated with this medication?',
    options: [
      { letter: 'A', text: 'Neural tube defects (spina bifida)' },
      { letter: 'B', text: 'Cardiac septal defects' },
      { letter: 'C', text: 'Fetal hydantoin syndrome (digit and facial abnormalities)' },
      { letter: 'D', text: 'Ebstein anomaly of the tricuspid valve' },
    ],
    correct: 'A',
    explanation: 'Valproic acid is the most teratogenic AED, with 1–2% risk of neural tube defects (vs. 0.1% baseline) — primarily spina bifida. The mechanism involves impaired folate metabolism and histone deacetylase inhibition affecting neural tube closure. Fetal hydantoin syndrome is caused by phenytoin; Ebstein anomaly by lithium. High-dose folate supplementation reduces but does not eliminate risk.',
    pearl: 'Valproate = highest teratogen risk among AEDs → neural tube defects. Counsel all women of childbearing age. Lamotrigine is relatively safer. Also watch for valproate hepatotoxicity and pancreatitis.',
    optionExplanations: {
      A: 'Valproate inhibits histone deacetylase and impairs folate metabolism — both critical for neural tube closure during weeks 3–4 of embryogenesis. The absolute risk of neural tube defects (primarily spina bifida) is 1–2% with valproate, representing a 10–20-fold increase over the 0.1% baseline risk. High-dose folic acid (4–5 mg/day) reduces but does not eliminate this risk, making valproate the most teratogenic AED.',
      B: 'Cardiac septal defects are associated with phenobarbital and carbamazepine exposure in utero. Lithium specifically causes Ebstein anomaly (downward displacement of the tricuspid valve). Valproate\'s primary structural defect is neural tube related, not cardiac — students should not conflate the organ system affected with the drug responsible.',
      C: 'Fetal hydantoin syndrome results from phenytoin (diphenylhydantoin) exposure and includes digit/nail hypoplasia, craniofacial abnormalities (hypertelorism, broad nasal bridge, cleft palate), and mild intellectual disability. Valproate and phenytoin are both classic AED teratogens, but their specific embryopathies are completely distinct — this distractor tests whether students know which drug causes which syndrome.',
      D: "Ebstein anomaly (downward displacement of the tricuspid valve into the RV) is the classic teratogenic effect of lithium (used in bipolar disorder). The absolute risk with lithium is lower than historically feared (~0.1–0.2%) but remains a counseling point. Remembering: Ebstein = lithium, neural tube = valproate, hydantoin syndrome = phenytoin separates three board-favorite drug-teratogen pairings.",
    },
  },
  {
    id: 'q017',
    subject: 'Biochemistry',
    system: 'Multisystem',
    difficulty: 'Balanced',
    testedConcept: 'Classic galactosemia — galactitol accumulation and cataract mechanism',
    weakSpotCategory: 'Inborn Errors of Metabolism',
    memoryAnchor: 'Galactosemia: galactitol (lens) = cataracts by osmotic swelling. Galactose-1-P (liver/brain) = toxicity. Urine: reducing substance+ but glucose oxidase−.',
    commonTrap: 'Students pick galactose-1-phosphate for cataracts because it causes hepatic and CNS toxicity — but the lens cataract is specifically due to galactitol (via aldose reductase + osmotic water influx), not galactose-1-P.',
    stem: 'A 2-month-old boy has failure to thrive, jaundice, cataracts, and vomiting after milk feedings. Urine reducing substance is positive but glucose oxidase test is negative. Absent galactose-1-phosphate uridylyltransferase (GALT) activity is confirmed. Which metabolite accumulation is responsible for the cataracts?',
    options: [
      { letter: 'A', text: 'Galactitol (a sugar alcohol reduced from galactose by aldose reductase)' },
      { letter: 'B', text: 'Galactose-1-phosphate accumulation in the lens' },
      { letter: 'C', text: 'UDP-galactose buildup in the cytoplasm' },
      { letter: 'D', text: 'Glucose-6-phosphate competing with galactose metabolism' },
    ],
    correct: 'A',
    explanation: 'In classic galactosemia (GALT deficiency), excess galactose is reduced by aldose reductase to galactitol in the lens. Galactitol cannot exit the lens and causes osmotic water influx → cataracts. Galactose-1-phosphate accumulation causes hepatotoxicity and brain damage, but galactitol specifically causes cataracts. Positive reducing substance + negative glucose oxidase = galactosuria (not glucosuria).',
    pearl: 'Galactosemia: galactitol → cataracts (osmotic); galactose-1-P → liver/brain toxicity. Urine: positive reducing substance, glucose-oxidase negative. Treat: eliminate galactose (soy formula).',
  },
  {
    id: 'q018',
    subject: 'Immunology',
    system: 'Immunology',
    difficulty: 'NBME Difficult',
    testedConcept: 'X-linked agammaglobulinemia — BTK mutation and B cell maturation arrest',
    weakSpotCategory: 'Primary Immunodeficiencies',
    memoryAnchor: 'XLA: BruTon BTK. X-linked, Boys only, B cells absent, all Ig absent, normal T cells. Presents ~6 months. Treat: IVIG.',
    commonTrap: 'Students pick ADA deficiency because both cause recurrent bacterial infections, but ADA deficiency is SCID (both B and T cells absent) — normal T cells in this patient immediately excludes any SCID diagnosis.',
    stem: 'A 6-year-old boy has recurrent infections with encapsulated organisms (S. pneumoniae, H. influenzae, N. meningitidis). Flow cytometry shows absent B cells with very low serum immunoglobulins; T cell counts are normal. His maternal uncles had similar histories. Which pathophysiology best explains this presentation?',
    options: [
      { letter: 'A', text: 'Defective BTK tyrosine kinase causing failure of B cell maturation beyond the pro-B stage' },
      { letter: 'B', text: 'ADA enzyme deficiency causing toxic deoxyadenosine accumulation in B and T cells' },
      { letter: 'C', text: 'Absent MHC class II expression causing failure of CD4+ T cell activation' },
      { letter: 'D', text: 'Defective CD40L on T cells preventing B cell class-switch recombination' },
    ],
    correct: 'A',
    explanation: 'X-linked agammaglobulinemia (Bruton disease) is caused by BTK mutations. BTK is required for B cell maturation beyond the pro-B cell stage; without it, mature B cells are absent and immunoglobulins are absent. T cells are normal. X-linked inheritance explains the affected males with affected maternal uncles. ADA deficiency causes SCID (both B and T cell failure). CD40L deficiency causes hyper-IgM syndrome.',
    pearl: 'XLA (Bruton): BTK mutation, X-linked, absent B cells + absent Ig, normal T cells. Presents ~6 months (after maternal Ab wane). Recurrent encapsulated bacterial infections. Treat: IVIG.',
    optionExplanations: {
      A: 'BTK (Bruton tyrosine kinase) is essential for pre-BCR signaling at the pro-B to pre-B cell transition. Without BTK, B cells cannot mature past the pro-B stage — circulating mature B cells and all immunoglobulin classes are absent. X-linked inheritance (BTK gene on chromosome Xq21.3) means males are affected; females are carriers. The maternal uncle pattern is classic for X-linked recessive transmission.',
      B: 'ADA (adenosine deaminase) deficiency causes SCID by allowing toxic deoxyadenosine accumulation, which is especially damaging to developing lymphocytes — both T and B cells are eliminated. The critical distinguishing feature is that ADA deficiency eliminates BOTH B and T cells (SCID), whereas this patient has NORMAL T cell counts. Any SCID diagnosis is excluded by the normal T cell count.',
      C: 'Bare lymphocyte syndrome (MHC class II deficiency) impairs CD4+ T cell development and activation by preventing antigen presentation. T cell function is severely compromised, and B cells cannot receive T cell help for class-switching. However, B cells are PRESENT (unlike XLA where they are absent), and the clinical phenotype includes T cell dysfunction — distinct from the isolated B cell/Ig deficiency seen here.',
      D: 'CD40L deficiency (X-linked hyper-IgM syndrome, HIGM1) prevents T cells from sending the CD40/CD40L co-stimulatory signal to B cells, blocking class-switch recombination. The result is very high IgM with absent or very low IgG, IgA, and IgE — but B cells ARE present and CAN produce IgM. This is a completely different phenotype from XLA where B cells are absent and all Ig classes (including IgM) are depleted.',
    },
  },
  {
    id: 'q019',
    subject: 'Pathology',
    system: 'Musculoskeletal',
    difficulty: 'Balanced',
    testedConcept: 'Rheumatoid arthritis — synovial pathology and pannus formation',
    weakSpotCategory: 'Inflammatory Arthritis',
    memoryAnchor: 'RA: PANNUS = synoviocyte proliferation + CD4 T cells + TNF-α/IL-1/IL-6. MCP+PIP spared DIP. Anti-CCP most specific.',
    commonTrap: 'Students pick urate crystals because both gout and RA cause painful joints and bone destruction — but gout presents acutely with podagra (1st MTP), not symmetric morning stiffness with positive RF and anti-CCP.',
    stem: 'A 45-year-old woman has symmetric swelling and morning stiffness >1 hour in her MCP and PIP joints, sparing the DIPs. Labs show elevated ESR, CRP, positive RF, and elevated anti-CCP antibodies. X-ray shows periarticular osteopenia. Which synovial pathological finding is most characteristic?',
    options: [
      { letter: 'A', text: 'Pannus formation from proliferating synoviocytes and inflammatory granulation tissue' },
      { letter: 'B', text: 'Sodium urate crystal deposition in the synovium with tophaceous deposits' },
      { letter: 'C', text: 'Calcium pyrophosphate crystal deposition in fibrocartilage (chondrocalcinosis)' },
      { letter: 'D', text: 'Fibrinous exudate with PMN-predominant synovial fluid' },
    ],
    correct: 'A',
    explanation: 'RA is characterized by pannus — inflammatory granulation tissue composed of proliferating type A synoviocytes, fibroblast-like synoviocytes, and infiltrating CD4+ T cells, B cells, and plasma cells. The pannus erodes cartilage and bone. Driven by TNF-α, IL-1, and IL-6. Anti-CCP is the most specific serologic marker.',
    pearl: 'RA synovium: pannus = synoviocyte proliferation + CD4 T cells + TNF-α/IL-1/IL-6. MCP + PIP, DIP spared. Anti-CCP most specific. Treat: MTX + biologic (TNF-i, IL-6i, or JAKi).',
  },
  {
    id: 'q020',
    subject: 'Biochemistry',
    system: 'Neurology',
    difficulty: 'Balanced',
    testedConcept: 'Wernicke encephalopathy — thiamine deficiency and PDH/alpha-KGDH impairment',
    weakSpotCategory: 'Neurological Nutritional Deficiencies',
    memoryAnchor: "Wernicke triad: Confusion + Ophthalmoplegia + Ataxia. Thiamine BEFORE glucose. 'Thief before the ATM' — Thiamine first, then glucose (ATM).",
    commonTrap: "Students pick defective myelin synthesis (B) because it sounds like B12 deficiency — but B12 causes subacute combined degeneration (posterior/lateral cord), not the acute Wernicke triad. Different vitamin, different presentation.",
    stem: 'A 45-year-old man with alcohol use disorder is confused, with nystagmus, ophthalmoplegia, and ataxia. He is afebrile with no meningismus. His diet consists almost entirely of alcohol. Which mechanism explains how the responsible deficiency causes neurological damage?',
    options: [
      { letter: 'A', text: 'Impaired oxidative decarboxylation of alpha-keto acids, reducing ATP and NADH availability' },
      { letter: 'B', text: 'Defective myelin synthesis from impaired methionine regeneration' },
      { letter: 'C', text: 'Methylmalonyl-CoA accumulation inhibiting succinyl-CoA metabolism' },
      { letter: 'D', text: 'Excess homocysteine causing direct endothelial toxicity and thrombosis' },
    ],
    correct: 'A',
    explanation: 'Wernicke encephalopathy results from thiamine (B1) deficiency. Thiamine pyrophosphate is an essential cofactor for pyruvate dehydrogenase, alpha-ketoglutarate dehydrogenase, and transketolase. Without it, the TCA cycle cannot run efficiently, starving high-energy neurons of ATP. Classic triad: confusion + ophthalmoplegia + ataxia. Always give thiamine before glucose in alcoholics — glucose bolus depletes remaining thiamine.',
    pearl: 'Wernicke: thiamine (B1) deficiency → impaired PDH/α-KGDH/transketolase. Triad: confusion + ophthalmoplegia + ataxia. Give thiamine BEFORE glucose. Untreated → Korsakoff (confabulation, anterograde amnesia).',
    optionExplanations: {
      A: 'Thiamine (B1) as thiamine pyrophosphate (TPP) is an essential cofactor for three critical enzymes: pyruvate dehydrogenase (converting pyruvate to acetyl-CoA for TCA entry), alpha-ketoglutarate dehydrogenase (an essential TCA cycle step), and transketolase (pentose phosphate pathway). Without TPP, the TCA cycle stalls, severely reducing ATP production in high-demand neurons — particularly in the mammillary bodies, thalamus, and oculomotor nuclei, explaining the Wernicke triad.',
      B: 'Defective myelin synthesis from impaired methionine regeneration is the mechanism of B12 (cobalamin) deficiency neuropathy. B12 is required for methionine synthase, and its deficiency causes subacute combined degeneration of the spinal cord — posterior column ataxia, lateral corticospinal tract spasticity, and dorsal root paresthesias. This is a different vitamin, a different biochemical pathway, and a completely different clinical presentation from Wernicke encephalopathy.',
      C: "Methylmalonyl-CoA accumulation is the metabolic consequence of B12 deficiency specifically (methylmalonyl-CoA mutase requires adenosylcobalamin as cofactor). Its buildup interferes with normal fatty acid synthesis and myelin structural integrity. This is option B's underlying mechanism described at a biochemical level — still B12 deficiency, not thiamine deficiency.",
      D: 'Homocysteine elevation occurs in B12 or folate deficiency (both impair the remethylation of homocysteine to methionine). Elevated homocysteine increases cardiovascular risk through endothelial toxicity and is weakly associated with dementia, but it is not the mechanism of Wernicke encephalopathy. This distractor conflates B-vitamin deficiencies without distinguishing their specific neurological manifestations.',
    },
  },
  {
    id: 'q021',
    subject: 'Pharmacology',
    system: 'Cardiovascular',
    difficulty: 'Balanced',
    testedConcept: 'DOAC renal dosing — dabigatran most renally dependent, contraindicated in severe CKD',
    weakSpotCategory: 'Anticoagulation Pharmacology',
    memoryAnchor: "DOACs in CKD: Dabigatran = most renal (80%), avoid eGFR<30. Apixaban = safest CKD option. 'A for Apixaban = Acceptable in Any kidney.'",
    commonTrap: "Students pick rivaroxaban because it is also renally cleared and commonly discussed with CKD adjustments — but dabigatran's ~80% renal elimination is far higher than rivaroxaban's ~35%, making dabigatran the most significantly restricted.",
    stem: 'A 67-year-old man with CKD stage 3b (eGFR 32) and T2DM develops atrial fibrillation and needs anticoagulation for stroke prevention. Which DOAC requires the most significant dose adjustment or is contraindicated at this level of renal function?',
    options: [
      { letter: 'A', text: 'Dabigatran (direct thrombin inhibitor)' },
      { letter: 'B', text: 'Apixaban (factor Xa inhibitor)' },
      { letter: 'C', text: 'Rivaroxaban (factor Xa inhibitor)' },
      { letter: 'D', text: 'Warfarin (vitamin K antagonist)' },
    ],
    correct: 'A',
    explanation: 'Dabigatran is 80% renally eliminated and is contraindicated at eGFR <30 in the US (dose reduction required at eGFR 30–50). Apixaban is the preferred DOAC in CKD due to predominantly hepatic metabolism (~27% renal); dose reduction only needed at eGFR <25. Rivaroxaban has ~35% renal elimination, needs adjustment at eGFR <50. Warfarin is hepatically metabolized and requires no adjustment for renal function alone.',
    pearl: 'DOACs in CKD: Dabigatran = most renally dependent (avoid at eGFR <30). Apixaban = safest in CKD. Remember: the \'a\' in apixAban = safest renal profile. Warfarin = hepatic, no CKD renal adjustment.',
  },
  {
    id: 'q022',
    subject: 'Physiology',
    system: 'Cardiovascular',
    difficulty: 'UWorld Challenge',
    testedConcept: 'Severe aortic stenosis — hemodynamic consequences (increased afterload, concentric LVH, diastolic dysfunction)',
    weakSpotCategory: 'Valvular Hemodynamics',
    memoryAnchor: 'AS = afterload ↑ → concentric LVH → diastolic dysfunction. Classic triad: Syncope + Angina + Dyspnea (SAD). Mean gradient >40 = severe.',
    commonTrap: "Students pick eccentric dilation (C) because they confuse the LV response to AFTERLOAD (concentric hypertrophy in AS) with VOLUME overload (eccentric dilation in AR) — the key is matching the type of overload to the compensatory mechanism.",
    stem: 'A 70-year-old woman has severe aortic stenosis (valve area 0.7 cm², mean gradient 52 mmHg). She is in cardiogenic shock. Which of the following hemodynamic changes best characterizes severe aortic stenosis?',
    options: [
      { letter: 'A', text: 'Increased left ventricular afterload with concentric hypertrophy and diastolic dysfunction' },
      { letter: 'B', text: 'Decreased left ventricular preload from reduced venous return' },
      { letter: 'C', text: 'Increased left ventricular preload with eccentric dilation and systolic dysfunction' },
      { letter: 'D', text: 'Reduced coronary perfusion pressure from low aortic diastolic pressure alone' },
    ],
    correct: 'A',
    explanation: 'Severe aortic stenosis creates a fixed outflow obstruction, dramatically increasing LV afterload. In response, the LV undergoes concentric hypertrophy (increased wall thickness, normal or reduced chamber size). The hypertrophied, stiff LV develops diastolic dysfunction. Reduced coronary perfusion occurs because hypertrophied myocardium has increased oxygen demand with reduced subendocardial perfusion — a dual mechanism for ischemia in AS without obstructive CAD.',
    pearl: 'Severe AS: increased afterload → concentric LVH → diastolic dysfunction. Subendocardial ischemia from: (1) increased O2 demand by hypertrophied LV, (2) reduced perfusion time (long ejection phase). Classic: syncope + angina + dyspnea = severe AS triad.',
  },
  {
    id: 'q023',
    subject: 'Anatomy',
    system: 'Musculoskeletal',
    difficulty: 'Balanced',
    testedConcept: 'Radial nerve injury at radial groove — wrist drop with preserved dorsal hand sensation',
    weakSpotCategory: 'Peripheral Nerve Lesions',
    memoryAnchor: 'Radial groove injury: WRIST DROP + preserved dorsal hand sensation (superficial branch already given off). Posterior interosseous nerve (forearm): finger drop only, no sensory loss.',
    commonTrap: "Students forget that the superficial radial nerve (sensory) branches off PROXIMAL to the radial groove injury site, so dorsal hand sensation is preserved — wrist drop with intact sensation is the hallmark of radial groove lesion.",
    stem: 'A 45-year-old construction worker presents with inability to extend the wrist and fingers after falling on his outstretched hand. Sensation is intact over the dorsum of the hand and fingers. Which nerve and site of injury best explains these findings?',
    options: [
      { letter: 'A', text: 'Radial nerve in the radial groove of the humerus (Saturday night palsy)' },
      { letter: 'B', text: 'Anterior interosseous nerve in the proximal forearm' },
      { letter: 'C', text: 'Ulnar nerve at the medial epicondyle' },
      { letter: 'D', text: 'Median nerve at the carpal tunnel' },
    ],
    correct: 'A',
    explanation: 'Radial nerve injury at the radial groove (mid-humerus) causes wrist drop (inability to extend the wrist and MCP joints) and finger drop. Sensation over the dorsum of the hand is supplied by the superficial radial nerve, which branches proximal to the radial groove, so sensation is preserved when the injury is at this level. Anterior interosseous nerve injury causes weakness of FPL and FDP to the index finger with no sensory loss. Ulnar and median nerve injuries cause different patterns.',
    pearl: 'Radial groove injury: wrist drop + finger drop + preserved hand dorsum sensation (superficial branch spared). Posterior interosseous nerve injury (in forearm): finger drop only, wrist extension partially preserved, no sensory loss.',
  },
  {
    id: 'q024',
    subject: 'Physiology',
    system: 'Endocrine',
    difficulty: 'Balanced',
    testedConcept: 'Primary hyperparathyroidism — PTH mechanisms of hypercalcemia',
    weakSpotCategory: 'Calcium and PTH Regulation',
    memoryAnchor: "Primary HPT: PTH↑, Ca↑, PO4↓, urine Ca↑. 'Stones, bones, groans, psychic moans.' Adenoma most common. PTHrP = malignancy (PTH↓).",
    commonTrap: 'Students pick PTH directly stimulating intestinal calcium channels (B) because PTH does increase intestinal absorption — but the mechanism is INDIRECT: PTH activates 1α-hydroxylase in the kidney → calcitriol → enterocytes absorb calcium.',
    stem: 'A 35-year-old man with a history of kidney stones presents with hypercalcemia, hypophosphatemia, elevated PTH, and increased urinary calcium. Neck ultrasound shows a 1.2 cm lesion of the left inferior parathyroid gland. Which of the following best describes the mechanism of hypercalcemia in this condition?',
    options: [
      { letter: 'A', text: 'PTH stimulates osteoclast activity and increases renal calcium reabsorption while promoting phosphate excretion' },
      { letter: 'B', text: 'PTH increases intestinal calcium absorption by directly stimulating enterocyte calcium channels' },
      { letter: 'C', text: 'PTH-related peptide (PTHrP) secreted by the parathyroid tumor mimics PTH action' },
      { letter: 'D', text: 'PTH activates 25-hydroxylase to produce calcitriol directly without renal processing' },
    ],
    correct: 'A',
    explanation: 'Primary hyperparathyroidism (usually a solitary adenoma) causes excess PTH, which: (1) activates osteoclasts via RANKL on osteoblasts → bone resorption → calcium released into blood, (2) increases renal calcium reabsorption in the DCT, (3) promotes phosphate excretion by the kidney (phosphaturic), and (4) indirectly increases intestinal absorption by stimulating 1-alpha-hydroxylase to make active calcitriol (1,25-OH2-D3). PTHrP is a feature of humoral hypercalcemia of malignancy.',
    pearl: 'Primary hyperparathyroidism: PTH ↑ → Ca ↑, PO4 ↓, PTH ↑, urine Ca ↑. Stones, bones, groans, psychic moans. Most common cause of hypercalcemia in outpatients. PTHrP = malignancy (Ca ↑, PTH ↓).',
  },
  {
    id: 'qLD001',
    subject: 'Pharmacology',
    system: 'Renal / Urinary',
    topic: 'Loop diuretics',
    difficulty: 'Balanced',
    testedConcept: 'Loop diuretics — NKCC2 inhibition in the thick ascending limb',
    weakSpotCategory: 'Diuretic Pharmacology',
    memoryAnchor: 'Loop diuretics block NKCC2 in the thick ascending limb (TAL). TAL is water-impermeable, so blocking NKCC2 destroys the medullary concentration gradient — explaining the powerful diuresis.',
    commonTrap: 'Students choose the distal convoluted tubule because thiazides act there. Loop diuretics target the thick ascending limb (NKCC2); thiazides target the DCT (NCC). Two distinct nephron segments, two distinct cotransporters.',
    stem: 'A 65-year-old woman with congestive heart failure is started on furosemide 40 mg IV for acute pulmonary edema and produces 2 liters of urine over 4 hours. Furosemide exerts its primary diuretic effect by blocking the Na-K-2Cl cotransporter (NKCC2). In which nephron segment does NKCC2 primarily reside?',
    options: [
      { letter: 'A', text: 'Thick ascending limb of the loop of Henle' },
      { letter: 'B', text: 'Distal convoluted tubule' },
      { letter: 'C', text: 'Proximal convoluted tubule' },
      { letter: 'D', text: 'Cortical collecting duct' },
    ],
    correct: 'A',
    explanation: 'Loop diuretics block the Na-K-2Cl cotransporter (NKCC2) on the luminal side of the thick ascending limb (TAL) of the loop of Henle. The TAL is impermeable to water, so it is the primary site for generating the hypertonic medullary interstitium needed for renal concentration. Blocking NKCC2 prevents the medullary gradient from forming, producing a large volume of dilute urine. Loop diuretics reabsorb ~25% of filtered sodium — the largest single-segment contribution — explaining their superior potency.',
    pearl: 'Loop diuretics = NKCC2 in thick ascending limb. TAL is water-impermeable → blocking NKCC2 destroys the medullary gradient. ~25% of filtered Na handled here → most potent diuretic class.',
    optionExplanations: {
      A: 'NKCC2 is expressed exclusively on the apical (luminal) membrane of thick ascending limb cells. Furosemide competes with chloride at its binding site on NKCC2, preventing simultaneous cotransport of 1 Na⁺, 1 K⁺, and 2 Cl⁻. The TAL is impermeable to water, so Na removal without accompanying water creates a diluting effect and eliminates the osmotic gradient that drives ADH-regulated water reabsorption in the collecting duct — explaining both diuresis and the inability to concentrate urine with loop diuretics.',
      B: 'The distal convoluted tubule (DCT) contains NCC, the Na-Cl cotransporter inhibited by thiazide diuretics. Thiazides and loop diuretics act at completely different nephron sites. The DCT handles only 5–8% of filtered sodium, which is why thiazide-induced diuresis is substantially less powerful than loop diuretic-induced diuresis.',
      C: 'The proximal convoluted tubule reabsorbs ~65% of filtered sodium via the NHE3 exchanger and cotransporters, but loop diuretics have no clinically significant action here. Carbonic anhydrase inhibitors (acetazolamide) act at the PCT. Despite handling the most filtered sodium, the PCT is not where furosemide acts.',
      D: 'The cortical collecting duct contains ENaC (epithelial sodium channel) regulated by aldosterone. Potassium-sparing diuretics (spironolactone, amiloride, triamterene) act here. Loop diuretics have no direct action at the collecting duct, though they indirectly increase Na delivery to this segment, promoting secondary kaliuresis.',
    },
  },
  {
    id: 'qLD002',
    subject: 'Pharmacology',
    system: 'Loop Diuretics',
    difficulty: 'Balanced',
    testedConcept: 'Loop diuretic ototoxicity — NKCC1 inhibition in stria vascularis, risk factors',
    weakSpotCategory: 'Diuretic Adverse Effects',
    memoryAnchor: 'Loop ototoxicity: NKCC1 in stria vascularis → ↓endolymph K⁺ → ↓endocochlear potential → hair cell failure. Risk ↑ with high dose, rapid IV infusion, aminoglycosides, renal failure.',
    commonTrap: 'Students attribute ototoxicity to direct hair cell destruction (the aminoglycoside mechanism). Loop diuretics primarily act upstream by inhibiting NKCC1 in the stria vascularis, disrupting the ionic composition of endolymph — the hair cells are secondarily affected.',
    stem: 'A 70-year-old man with end-stage renal disease and pulmonary edema receives furosemide 250 mg IV administered over 10 minutes. He is concurrently on gentamicin for gram-negative bacteremia. The next day he reports bilateral tinnitus and reduced hearing acuity. Which mechanism best explains this adverse effect of furosemide?',
    options: [
      { letter: 'A', text: 'Inhibition of NKCC1 in the stria vascularis disrupts endolymph ionic composition and the endocochlear potential' },
      { letter: 'B', text: 'Direct oxidative damage to cochlear outer hair cells by furosemide-generated reactive oxygen species' },
      { letter: 'C', text: 'Vasoconstriction of the cochlear blood supply causing ischemic hair cell loss' },
      { letter: 'D', text: 'Furosemide chelation of calcium in the perilymph reducing action potential propagation' },
    ],
    correct: 'A',
    explanation: 'Loop diuretics inhibit NKCC1 (the non-renal isoform) in stria vascularis endothelial cells. NKCC1 maintains the high-K⁺, low-Na⁺ endolymph composition that sustains the +80 mV endocochlear potential. Furosemide-induced NKCC1 inhibition reduces endolymph K⁺ and collapses the endocochlear potential, impairing hair cell mechanoelectrical transduction. Risk factors: high doses, rapid IV infusion, renal failure (drug accumulation), and concurrent aminoglycosides (synergistic ototoxicity via separate mechanisms).',
    pearl: 'Loop diuretic ototoxicity: NKCC1 inhibition in stria vascularis → ↓endocochlear potential → tinnitus/hearing loss. Often reversible. Infuse slowly. Avoid aminoglycosides concurrently.',
    optionExplanations: {
      A: 'Loop diuretics inhibit NKCC1 (expressed in stria vascularis) in addition to NKCC2 (expressed in TAL). NKCC1 pumps K⁺ into the endolymph, generating the ~+80 mV endocochlear potential across the reticular lamina. This potential is the driving force for mechanosensory transduction by cochlear hair cells. Furosemide\'s NKCC1 inhibition collapses this potential, impairing mechanotransduction. Ototoxicity risk is dramatically increased by high doses, rapid IV infusion, renal failure (reduces clearance and raises serum levels), and concurrent aminoglycoside use.',
      B: 'Direct oxidative hair cell destruction is the primary mechanism of aminoglycoside (gentamicin) ototoxicity. Aminoglycosides are taken up by hair cells via mechanoelectrical transduction channels and generate reactive oxygen species intracellularly, causing irreversible outer hair cell loss. Furosemide acts primarily via an ionic mechanism (NKCC1 inhibition) upstream of the hair cells. The combination of furosemide + aminoglycosides is synergistically ototoxic because NKCC1 inhibition sensitizes the cochlea to aminoglycoside uptake.',
      C: 'Cochlear vasoconstriction is associated with vasospastic disorders and sickle cell disease, not the primary mechanism of loop diuretic ototoxicity. Furosemide does not significantly vasoconstrict cochlear vasculature at clinical doses. This distractor conflates ischemic hearing loss with drug-induced ionic disruption.',
      D: 'Furosemide is not a chelating agent and does not bind calcium in the perilymph. Calcium chelation in the inner ear is not a recognized pharmacological mechanism. This distractor incorrectly applies chemistry analogies to drug pharmacology. Furosemide\'s ototoxicity is an ionic mechanism mediated by NKCC1 inhibition.',
    },
  },
  {
    id: 'qLD003',
    subject: 'Pharmacology',
    system: 'Loop Diuretics',
    difficulty: 'Balanced',
    testedConcept: 'Loop vs thiazide diuretics — opposite effects on urinary calcium (hypercalciuria vs hypocalciuria)',
    weakSpotCategory: 'Diuretic Pharmacology',
    memoryAnchor: 'Loops Lose calcium (hypercalciuria — worsen calcium stones). Thiazides Trap calcium (hypocalciuria — treat calcium stones, hypercalciuria). K-sparing Keeps potassium.',
    commonTrap: 'Students confuse loop and thiazide calcium effects because both are diuretics that lower blood pressure. The opposite calcium effects are one of the highest-yield distinctions: loops cause hypercalciuria (avoid in stone-formers); thiazides cause hypocalciuria (first-line for idiopathic hypercalciuria).',
    stem: 'A 48-year-old woman with recurrent calcium oxalate kidney stones and hypertension has a 24-hour urinary calcium of 380 mg/day (elevated). Her physician wants to add a diuretic that will simultaneously lower blood pressure and reduce urinary calcium excretion. Which drug class best addresses both goals?',
    options: [
      { letter: 'A', text: 'Thiazide diuretic — inhibits NCC in the DCT, increasing distal calcium reabsorption' },
      { letter: 'B', text: 'Loop diuretic — blocks NKCC2 in the TAL, increasing urinary calcium loss' },
      { letter: 'C', text: 'Potassium-sparing diuretic — reduces aldosterone-mediated sodium retention at the collecting duct' },
      { letter: 'D', text: 'Carbonic anhydrase inhibitor — alkalinizes urine to reduce calcium oxalate supersaturation' },
    ],
    correct: 'A',
    explanation: 'Thiazides inhibit NCC in the DCT, reducing intracellular Na⁺ and activating basolateral NCX1 (Na-Ca exchanger), which increases calcium reabsorption from the tubular lumen. The net effect is hypocalciuria — reduced urinary calcium — making thiazides first-line for idiopathic hypercalciuria and calcium stone prevention. Loop diuretics produce the opposite effect: blocking NKCC2 abolishes the lumen-positive potential in the TAL that drives paracellular calcium reabsorption, causing hypercalciuria and worsening stone risk.',
    pearl: 'Loops Lose calcium (hypercalciuria — contraindicated in calcium stone disease). Thiazides Trap calcium (hypocalciuria — first-line for idiopathic hypercalciuria). Loop diuretics are used to lower calcium in acute severe hypercalcemia (with saline) — the reverse scenario.',
    optionExplanations: {
      A: 'Thiazides inhibit NCC in the DCT, creating mild cellular sodium depletion. This activates basolateral Na/Ca exchange (NCX1) — as intracellular Na falls, NCX1 moves more Ca out of the cell and more Na in, increasing calcium transport from the tubular lumen into the interstitium. Additionally, proximal NHE3-mediated sodium and passive calcium reabsorption increases to compensate for DCT sodium loss. The combined result is hypocalciuria, which reduces supersaturation and calcium stone formation. Thiazides are first-line pharmacotherapy for idiopathic hypercalciuria.',
      B: 'Loop diuretics block NKCC2 in the thick ascending limb, abolishing the lumen-positive transepithelial potential that drives passive paracellular calcium and magnesium reabsorption in that segment. The result is hypercalciuria — increased calcium excretion — which would worsen this patient\'s stone risk. Loop diuretics are used acutely to treat severe hypercalcemia (combined with IV saline to force urinary calcium excretion), which is the opposite clinical indication from calcium stone disease with idiopathic hypercalciuria.',
      C: 'Potassium-sparing diuretics (spironolactone, amiloride, triamterene) act at the collecting duct principal cells and have no clinically significant effect on renal calcium handling. They are indicated for aldosterone excess states, hypokalemia, or as adjuncts to prevent potassium wasting. They are not used for hypercalciuria or calcium stone prevention.',
      D: 'Acetazolamide inhibits carbonic anhydrase, causing bicarbonaturia and urine alkalinization. Alkaline urine increases calcium phosphate supersaturation (calcium phosphate solubility decreases at higher pH), potentially worsening calcium phosphate stone formation. Acetazolamide can reduce uric acid stone formation by alkalinizing urine but is not indicated for calcium oxalate stones or hypercalciuria — it may paradoxically worsen calcium stone disease.',
    },
  },
]

// ─── Question count enforcement (no cloning — fail clearly if pool is too small) ─────

/**
 * Returns exactly `config.questionCount` questions from the pool.
 * Throws INSUFFICIENT_QUESTIONS if the pool is smaller than requested.
 * Cloning is intentionally removed — duplicate questions are a product failure.
 *
 * @param {import('./quizTypes').QuizQuestion[]} questions
 * @param {import('./quizTypes').QuizConfig} config
 * @returns {import('./quizTypes').QuizQuestion[]}
 */
export function ensureQuestionCount(questions, config) {
  const target = config.questionCount
  if (questions.length >= target) return questions.slice(0, target)

  const is40Q  = target === 40 && config.mode === 'exam'
  const label  = is40Q
    ? 'Not enough unique questions available for a standardized 40 Question Block.'
    : 'Not enough unique questions available. Please broaden your filters or reduce the question count.'

  throw Object.assign(new Error(label), {
    code:      'INSUFFICIENT_QUESTIONS',
    available: questions.length,
    requested: target,
  })
}

/**
 * Builds a filtered, deduped pool from the mock bank using scope resolution.
 * For specific scopes (topic/clinicalFocus/coachSpecificTopic), filters with
 * isQuestionInScope and expands to system → subject → global when < 2 results.
 * For system/subject scopes, applies exact field match. For global, uses all questions.
 *
 * @param {import('./quizTypes').QuizConfig} config
 * @param {boolean} enrichedOnly - when true, restricts to ENRICHED_IDS (Coach Mode)
 * @param {{ seenIds: Set<string>, seenBaseIds: Set<string>, seenFingerprints: Set<string> }} seenState
 * @returns {{ questions: object[], expandedScope: boolean, originalScopeType: string, expandedScopeTo: string|null, excludedCount: number }}
 */
function _buildMockPool(config, enrichedOnly, seenState = EMPTY_SEEN_STATE) {
  const normalizedConfig = normalizeGenerationConfig(config)
  const scope = resolveGenerationScope(normalizedConfig)

  let bank = (enrichedOnly
    ? QUESTION_BANK.filter(q => ENRICHED_IDS.has(q.id))
    : QUESTION_BANK
  ).map(normalizeQuestion)

  let pool = bank
  let expandedScope = false
  const originalScopeType = scope.scopeType
  let expandedScopeTo = null

  if (isSpecificScope(scope)) {
    const inScope = bank.filter(q => isQuestionInScope(q, scope))
    if (inScope.length >= 2) {
      pool = inScope
    } else {
      expandedScope = true
      const sysPool = scope.system ? bank.filter(q => q.system === scope.system) : []
      const subPool = scope.subject ? bank.filter(q => q.subject === scope.subject) : []

      if (sysPool.length >= 2) {
        pool = sysPool
        expandedScopeTo = 'system'
      } else if (subPool.length >= 2) {
        pool = subPool
        expandedScopeTo = 'subject'
      } else {
        pool = bank
        expandedScopeTo = 'global'
      }
    }
  } else if (scope.scopeType === 'system') {
    const filtered = bank.filter(q => q.system === scope.scopeText)
    if (filtered.length >= 2) pool = filtered
  } else if (scope.scopeType === 'subject') {
    const filtered = bank.filter(q => q.subject === scope.scopeText)
    if (filtered.length >= 2) pool = filtered
  }

  if (config.difficulty && config.difficulty !== 'Balanced') {
    const diffPool = pool.filter(q => q.difficulty === config.difficulty)
    if (diffPool.length >= 2) pool = diffPool
  }

  pool = detectDuplicateQuestions(pool)

  if (expandedScope) {
    pool = pool.map(q => applyExpandedScopeMetadata(q, scope))
  } else if (isSpecificScope(scope)) {
    const meta = {
      rawTopic:       scope.rawTopic       || scope.scopeText,
      canonicalTopic: scope.canonicalTopic || scope.scopeText,
      topicSlug:      scope.topicSlug,
      topicSource:    scope.topicSource    || scope.scopeType,
      subject:        scope.subject,
      system:         scope.system,
    }
    pool = pool.map(q => applyTopicMetadataToQuestion(q, meta))
  }

  const totalBeforeExclusion = pool.length
  pool = filterUnseenQuestions(pool, seenState).sort(() => Math.random() - 0.5)
  const excludedCount = totalBeforeExclusion - pool.length

  return { questions: pool, expandedScope, originalScopeType, expandedScopeTo, excludedCount }
}

/**
 * @param {import('./quizTypes').QuizConfig} config
 * @returns {import('./quizTypes').QuizQuestion[]}
 */
export function generateMockQuestions(config) {
  const seenState = _seenStateFromHistory()
  const { questions } = _buildMockPool(config, false, seenState)
  return ensureQuestionCount(questions, config)
}

function _buildSessionMetadata(config, finalQuestions, excludedCount) {
  const validation = validateUniqueQuestions(finalQuestions)
  return {
    source:                       'mock-fallback',
    questionSource:               'mock-fallback',
    generatedAt:                  new Date().toISOString(),
    requestedQuestionCount:       config.questionCount,
    uniqueQuestionCount:          validation.uniqueCount,
    hasDuplicateQuestions:        !validation.valid,
    hasClonedQuestions:           false,
    hasReusedQuestions:           false,
    generationConfigSnapshot:     config,
    excludedPreviousQuestionCount: excludedCount,
  }
}

/**
 * @param {import('./quizTypes').QuizConfig} config
 * @returns {import('./quizTypes').QuizSession}
 */
export function createQuizSession(config) {
  const seenState = _seenStateFromHistory()

  if (config.mode === 'coach') {
    const { questions, expandedScope, originalScopeType, expandedScopeTo, excludedCount } = _buildMockPool(config, true, seenState)
    const finalQuestions = ensureQuestionCount(questions, config).map(shuffleQuestionOptions)

    return {
      id: `session_${Date.now()}`,
      mode: 'coach',
      config,
      questions: finalQuestions,
      answers: {},
      currentIndex: 0,
      startedAt: new Date().toISOString(),
      ..._buildSessionMetadata(config, finalQuestions, excludedCount),
      ...(expandedScope ? { expandedScope: true, originalScope: originalScopeType, expandedScopeTo } : {}),
    }
  }

  const { questions, expandedScope, originalScopeType, expandedScopeTo, excludedCount } = _buildMockPool(config, false, seenState)
  const finalQuestions = ensureQuestionCount(questions, config).map(shuffleQuestionOptions)

  return {
    id: `session_${Date.now()}`,
    mode: config.mode,
    config,
    questions: finalQuestions,
    answers: {},
    currentIndex: 0,
    startedAt: new Date().toISOString(),
    ..._buildSessionMetadata(config, finalQuestions, excludedCount),
    ...(expandedScope ? { expandedScope: true, originalScope: originalScopeType, expandedScopeTo } : {}),
  }
}
