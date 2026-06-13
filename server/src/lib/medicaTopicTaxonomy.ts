/**
 * Medica USMLE Step 1 Topic Taxonomy — v7.2.0
 *
 * Canonical topic registry scoped to Subject × System pairs.
 * Every canonical topic belongs to EXACTLY ONE pair — no duplicates, no alias collisions.
 *
 * ~138 high-yield Step 1 topics across 29 Subject × System pairs.
 * Basis: First Aid 2025, UWorld, NBME content specifications.
 *
 * Discovery mode: unknown topics WARN, not FAIL (see topicValidator.ts).
 * FAIL only when a topic's home differs in BOTH subject AND system from the tagged pair.
 */

import type { MedicaSubject, MedicaSystem } from './medicaTaxonomy.js';
import { getPairStatus } from './medicaUsmleMatrix.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface TopicEntry {
  readonly canonical: string;
  readonly aliases: readonly string[];
}

export interface TopicHome {
  readonly subject: MedicaSubject;
  readonly system: MedicaSystem;
}

export interface TopicLookupResult {
  readonly canonical: string;
  readonly subject: MedicaSubject;
  readonly system: MedicaSystem;
  /** True if the raw input matched an alias, not the canonical key. */
  readonly wasAlias: boolean;
}

// ── Key normalization (mirrors medicaTaxonomy.ts#buildLookup) ─────────────────

function key(s: string): string {
  return s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '');
}

/** Exported alias of the internal key() function for use by TaxonomyAliasService. */
export function taxonomyKey(s: string): string {
  return key(s);
}

// ── Taxonomy data ─────────────────────────────────────────────────────────────

const TOPIC_TAXONOMY: Readonly<Record<string, Readonly<Record<string, readonly TopicEntry[]>>>> = {

  // ════════════════════════════════════════════════════════════════════════════
  // PHARMACOLOGY
  // ════════════════════════════════════════════════════════════════════════════

  Pharmacology: {

    Cardiovascular: [
      { canonical: 'ACE Inhibitors',           aliases: ['ACEI', 'ace inhibitor', 'angiotensin-converting enzyme inhibitors', 'enalapril', 'lisinopril', 'ramipril'] },
      { canonical: 'Beta Blockers',             aliases: ['beta-blockers', 'beta adrenergic blockers', 'metoprolol', 'carvedilol', 'atenolol', 'propranolol', 'beta blocker'] },
      { canonical: 'Calcium Channel Blockers',  aliases: ['CCB', 'calcium channel antagonists', 'amlodipine', 'verapamil', 'diltiazem', 'calcium channel blocker'] },
      { canonical: 'Statins',                   aliases: ['HMG-CoA reductase inhibitors', 'statin therapy', 'atorvastatin', 'simvastatin', 'rosuvastatin', 'pravastatin'] },
      { canonical: 'Digoxin',                   aliases: ['cardiac glycosides', 'digitalis', 'digoxin toxicity', 'cardiac glycoside'] },
      { canonical: 'Antiarrhythmics',           aliases: ['antiarrhythmic drugs', 'antiarrhythmic agents', 'amiodarone', 'flecainide', 'procainamide', 'sotalol', 'antiarrhythmic'] },
      { canonical: 'Nitrates',                  aliases: ['organic nitrates', 'nitroglycerin', 'isosorbide dinitrate', 'nitroprusside', 'nitrate therapy'] },
      { canonical: 'Thiazide Diuretics',        aliases: ['thiazides', 'hydrochlorothiazide', 'HCTZ', 'chlorthalidone', 'thiazide diuretic', 'thiazide'] },
    ],

    'Renal / Urinary': [
      { canonical: 'Loop Diuretics',                aliases: ['loop diuretic', 'furosemide', 'bumetanide', 'ethacrynic acid', 'torsemide'] },
      { canonical: 'Potassium-Sparing Diuretics',   aliases: ['K-sparing diuretics', 'spironolactone', 'eplerenone', 'amiloride', 'potassium sparing diuretic', 'aldosterone antagonist'] },
      { canonical: 'SGLT2 Inhibitors',              aliases: ['SGLT2 inhibitor', 'gliflozins', 'flozins', 'empagliflozin', 'dapagliflozin', 'canagliflozin', 'SGLT-2 inhibitor'] },
      { canonical: 'NSAIDs and Renal Toxicity',     aliases: ['NSAID nephropathy', 'NSAID-induced nephropathy', 'NSAID renal effects', 'NSAID nephrotoxicity', 'NSAIDs renal'] },
      { canonical: 'Contrast-Induced Nephropathy',  aliases: ['contrast nephropathy', 'radiocontrast nephropathy', 'contrast-induced AKI', 'contrast nephrotoxicity'] },
    ],

    Neurology: [
      { canonical: 'Antiepileptics',         aliases: ['anticonvulsants', 'antiepileptic drugs', 'AEDs', 'phenytoin', 'valproate', 'carbamazepine', 'levetiracetam', 'lamotrigine', 'antiepileptic', 'anticonvulsant'] },
      { canonical: 'Parkinson Disease Drugs', aliases: ['levodopa', 'carbidopa-levodopa', 'dopaminergic therapy', 'antiparkinson medications', 'MAO-B inhibitors', 'pramipexole', 'ropinirole', 'levodopa-carbidopa'] },
      { canonical: 'Opioid Analgesics',      aliases: ['opioids', 'narcotics', 'morphine', 'oxycodone', 'fentanyl', 'opioid receptor agonists', 'opioid', 'opioid drugs'] },
      { canonical: 'Local Anesthetics',      aliases: ['lidocaine local', 'bupivacaine', 'local anaesthetics', 'nerve block', 'local anesthetic', 'sodium channel blocker anesthetic'] },
      { canonical: 'Migraine Drugs',         aliases: ['triptans', 'sumatriptan', 'migraine treatment', 'ergot alkaloids', 'migraine therapy', 'migraine pharmacology'] },
    ],

    Psychiatry: [
      { canonical: 'Antidepressants',           aliases: ['SSRIs', 'SNRIs', 'tricyclic antidepressants', 'TCAs', 'MAOIs', 'fluoxetine', 'sertraline', 'amitriptyline', 'venlafaxine', 'antidepressant', 'SSRI', 'TCA'] },
      { canonical: 'Antipsychotics',            aliases: ['neuroleptics', 'typical antipsychotics', 'atypical antipsychotics', 'haloperidol', 'clozapine', 'risperidone', 'olanzapine', 'antipsychotic', 'neuroleptic'] },
      { canonical: 'Anxiolytics and Sedatives', aliases: ['benzodiazepines', 'non-benzo sedatives', 'barbiturates', 'diazepam', 'lorazepam', 'buspirone', 'benzodiazepine', 'anxiolytic', 'sedative-hypnotics'] },
      { canonical: 'Mood Stabilizers',          aliases: ['lithium', 'valproate mood', 'carbamazepine mood', 'mood stabilizer', 'lithium carbonate'] },
      { canonical: 'ADHD Medications',          aliases: ['methylphenidate', 'amphetamines', 'stimulant drugs', 'stimulant medications', 'mixed amphetamine salts', 'dextroamphetamine', 'ADHD drugs'] },
    ],

    Endocrine: [
      { canonical: 'Insulin',               aliases: ['insulin therapy', 'insulin analogs', 'rapid-acting insulin', 'basal insulin', 'NPH insulin', 'insulin glargine', 'insulin lispro'] },
      { canonical: 'Oral Hypoglycemics',    aliases: ['metformin', 'sulfonylureas', 'oral antidiabetics', 'biguanides', 'glipizide', 'glyburide', 'thiazolidinediones', 'glitazones', 'DPP-4 inhibitors', 'oral hypoglycemic'] },
      { canonical: 'Thyroid Drugs',         aliases: ['levothyroxine', 'antithyroid drugs', 'PTU', 'propylthiouracil', 'methimazole', 'thyroid replacement', 'thyroid pharmacology'] },
      { canonical: 'Corticosteroids',       aliases: ['glucocorticoids', 'steroids', 'prednisone', 'dexamethasone', 'cortisol therapy', 'glucocorticoid therapy', 'systemic steroids'] },
      { canonical: 'Bisphosphonates',       aliases: ['bisphosphonate therapy', 'alendronate', 'risedronate', 'bone resorption inhibitors', 'bisphosphonate'] },
      { canonical: 'Hormonal Contraceptives', aliases: ['oral contraceptives', 'OCP', 'combined oral contraceptive pill', 'estrogen-progestin', 'combined OCP', 'birth control pill'] },
    ],

    Hematology: [
      { canonical: 'Anticoagulants',                  aliases: ['heparin', 'warfarin', 'DOACs', 'direct oral anticoagulants', 'LMWH', 'low molecular weight heparin', 'apixaban', 'rivaroxaban', 'dabigatran', 'anticoagulant therapy'] },
      { canonical: 'Thrombolytics',                   aliases: ['tPA', 'tissue plasminogen activator', 'fibrinolytics', 'alteplase', 'streptokinase', 'thrombolytic therapy', 'fibrinolytic drugs'] },
      { canonical: 'Antiplatelet Drugs',              aliases: ['aspirin', 'clopidogrel', 'antiplatelet therapy', 'P2Y12 inhibitors', 'ticagrelor', 'antiplatelet'] },
      { canonical: 'Iron Supplementation',            aliases: ['iron therapy', 'ferrous sulfate', 'oral iron', 'parenteral iron', 'iron repletion'] },
      { canonical: 'Erythropoiesis-Stimulating Agents', aliases: ['ESA', 'EPO', 'erythropoietin', 'darbepoetin', 'erythropoiesis-stimulating agent'] },
    ],

    Respiratory: [
      { canonical: 'Bronchodilators',           aliases: ['beta-2 agonists', 'SABA', 'LABA', 'short-acting bronchodilator', 'albuterol', 'salmeterol', 'ipratropium', 'bronchodilator', 'beta2 agonist'] },
      { canonical: 'Inhaled Corticosteroids',   aliases: ['ICS', 'inhaled steroids', 'fluticasone', 'budesonide', 'beclomethasone', 'inhaled corticosteroid'] },
      { canonical: 'Leukotriene Modifiers',     aliases: ['montelukast', 'zafirlukast', 'leukotriene antagonists', 'leukotriene receptor antagonists', 'leukotriene modifier'] },
      { canonical: 'Methylxanthines',           aliases: ['theophylline', 'aminophylline', 'PDE inhibitors respiratory', 'phosphodiesterase inhibitors respiratory', 'methylxanthine'] },
    ],

    'Infectious Disease': [
      { canonical: 'Penicillins',      aliases: ['beta-lactams', 'amoxicillin', 'ampicillin', 'piperacillin', 'beta-lactam antibiotics', 'penicillin', 'oxacillin', 'nafcillin'] },
      { canonical: 'Cephalosporins',  aliases: ['cefazolin', 'ceftriaxone', 'cefepime', 'third-generation cephalosporins', 'cephalosporin antibiotics', 'cephalosporin'] },
      { canonical: 'Fluoroquinolones', aliases: ['quinolones', 'ciprofloxacin', 'levofloxacin', 'moxifloxacin', 'fluoroquinolone', 'quinolone antibiotic'] },
      { canonical: 'Macrolides',       aliases: ['azithromycin', 'erythromycin', 'clarithromycin', 'macrolide antibiotics', 'macrolide'] },
      { canonical: 'Aminoglycosides',  aliases: ['gentamicin', 'tobramycin', 'amikacin', 'aminoglycoside', 'aminoglycoside antibiotics'] },
      { canonical: 'Antifungals',      aliases: ['fluconazole', 'amphotericin B', 'azoles', 'antifungal drugs', 'voriconazole', 'caspofungin', 'antifungal', 'itraconazole'] },
    ],

  },

  // ════════════════════════════════════════════════════════════════════════════
  // PATHOLOGY
  // ════════════════════════════════════════════════════════════════════════════

  Pathology: {

    Cardiovascular: [
      { canonical: 'Atherosclerosis',      aliases: ['arteriosclerosis', 'atherogenesis', 'atherosclerotic plaque', 'foam cells', 'atheroma', 'atheromatous plaque'] },
      { canonical: 'Myocardial Infarction', aliases: ['MI', 'heart attack', 'acute MI', 'STEMI', 'NSTEMI', 'acute myocardial infarction', 'myocardial infarct'] },
      { canonical: 'Heart Failure',        aliases: ['congestive heart failure', 'CHF', 'systolic heart failure', 'diastolic heart failure', 'left heart failure', 'cardiac failure'] },
      { canonical: 'Cardiomyopathy',       aliases: ['dilated cardiomyopathy', 'hypertrophic cardiomyopathy', 'restrictive cardiomyopathy', 'HCM', 'DCM'] },
      { canonical: 'Valvular Heart Disease', aliases: ['aortic stenosis', 'mitral regurgitation', 'mitral stenosis', 'aortic regurgitation', 'valvular disease', 'cardiac valve disease'] },
      { canonical: 'Endocarditis',         aliases: ['infective endocarditis', 'bacterial endocarditis', 'subacute bacterial endocarditis', 'SBE', 'IE'] },
      { canonical: 'Pericarditis',         aliases: ['pericardial disease', 'cardiac tamponade', 'pericardial effusion', 'pericardial inflammation'] },
    ],

    'Renal / Urinary': [
      { canonical: 'Glomerulonephritis',  aliases: ['GN', 'nephritic syndrome', 'glomerular disease', 'RPGN', 'crescentic GN', 'rapidly progressive GN', 'IgA nephropathy'] },
      { canonical: 'Nephrotic Syndrome',  aliases: ['minimal change disease', 'membranous nephropathy', 'FSGS', 'focal segmental glomerulosclerosis', 'nephrotic'] },
      { canonical: 'Acute Kidney Injury', aliases: ['AKI', 'acute renal failure', 'acute tubular necrosis', 'ATN', 'prerenal azotemia', 'oliguric renal failure'] },
      { canonical: 'Chronic Kidney Disease', aliases: ['CKD', 'chronic renal failure', 'end-stage renal disease', 'ESRD', 'chronic kidney failure'] },
      { canonical: 'Renal Cell Carcinoma', aliases: ['RCC', 'clear cell carcinoma', 'hypernephroma', 'kidney carcinoma', 'renal carcinoma'] },
      { canonical: 'Nephrolithiasis',     aliases: ['kidney stones', 'renal calculi', 'urolithiasis', 'renal stones', 'calcium oxalate stones', 'uric acid stones'] },
    ],

    Neurology: [
      { canonical: 'Stroke',             aliases: ['cerebrovascular accident', 'CVA', 'ischemic stroke', 'hemorrhagic stroke', 'TIA', 'transient ischemic attack', 'cerebral infarction'] },
      { canonical: 'Parkinson Disease',  aliases: ['Parkinson\'s disease', 'PD neurodegenerative', 'dopaminergic degeneration', 'substantia nigra degeneration', 'Lewy bodies'] },
      { canonical: 'Alzheimer Disease',  aliases: ['Alzheimer\'s disease', 'AD dementia', 'amyloid plaques', 'neurofibrillary tangles', 'senile dementia'] },
      { canonical: 'Multiple Sclerosis', aliases: ['MS', 'demyelinating disease', 'autoimmune demyelination', 'optic neuritis', 'relapsing-remitting MS'] },
      { canonical: 'Brain Tumors',       aliases: ['glioblastoma', 'glioma', 'meningioma', 'medulloblastoma', 'CNS tumors', 'intracranial tumors', 'brain cancer'] },
    ],

    Endocrine: [
      { canonical: 'Diabetes Mellitus',    aliases: ['DM', 'type 1 diabetes', 'type 2 diabetes', 'T1DM', 'T2DM', 'diabetic ketoacidosis', 'DKA', 'hyperglycemia', 'insulin resistance'] },
      { canonical: 'Thyroid Disorders',    aliases: ['hypothyroidism', 'hyperthyroidism', 'Graves disease', 'Hashimoto thyroiditis', 'thyroid nodule', 'goiter', 'thyroid disease', 'Hashimoto\'s thyroiditis', 'Graves\' disease'] },
      { canonical: 'Adrenal Disorders',    aliases: ['Addison disease', 'Cushing syndrome', 'adrenal insufficiency', 'primary hyperaldosteronism', 'Conn syndrome', 'pheochromocytoma', 'adrenal crisis', 'Cushing\'s syndrome', 'Addison\'s disease'] },
      { canonical: 'Hyperparathyroidism', aliases: ['parathyroid adenoma', 'primary hyperparathyroidism', 'hypercalcemia PTH', 'PTH excess', 'parathyroid disease'] },
      { canonical: 'MEN Syndromes',        aliases: ['multiple endocrine neoplasia', 'MEN1', 'MEN2A', 'MEN2B', 'MEN2', 'multiple endocrine neoplasia syndrome'] },
    ],

    Respiratory: [
      { canonical: 'Asthma',             aliases: ['reactive airway disease', 'bronchial asthma', 'asthmatic bronchospasm', 'bronchial hyperreactivity'] },
      { canonical: 'COPD',               aliases: ['chronic obstructive pulmonary disease', 'emphysema', 'chronic bronchitis', 'obstructive lung disease'] },
      { canonical: 'Pneumonia Pathology', aliases: ['community-acquired pneumonia', 'CAP', 'hospital-acquired pneumonia', 'HAP', 'lobar pneumonia', 'bronchopneumonia'] },
      { canonical: 'Lung Cancer',        aliases: ['squamous cell carcinoma lung', 'adenocarcinoma lung', 'small cell lung carcinoma', 'SCLC', 'non-small cell lung cancer', 'NSCLC', 'pulmonary carcinoma'] },
      { canonical: 'Pulmonary Embolism', aliases: ['PE', 'DVT-PE', 'venous thromboembolism', 'VTE', 'pulmonary thromboembolism'] },
      { canonical: 'Pulmonary Fibrosis', aliases: ['idiopathic pulmonary fibrosis', 'IPF', 'interstitial lung disease', 'ILD', 'lung fibrosis'] },
    ],

    Gastrointestinal: [
      { canonical: 'Peptic Ulcer Disease',        aliases: ['PUD', 'gastric ulcer', 'duodenal ulcer', 'H. pylori ulcer', 'peptic ulcer'] },
      { canonical: 'Inflammatory Bowel Disease',  aliases: ['IBD', 'Crohn disease', 'ulcerative colitis', 'Crohn\'s disease', 'UC', 'intestinal inflammation'] },
      { canonical: 'Colorectal Cancer',           aliases: ['colon cancer', 'CRC', 'colorectal carcinoma', 'adenocarcinoma colon', 'rectal cancer'] },
      { canonical: 'Liver Cirrhosis',             aliases: ['hepatic cirrhosis', 'portal hypertension', 'cirrhosis', 'liver fibrosis end-stage'] },
      { canonical: 'Viral Hepatitis',             aliases: ['hepatitis B', 'hepatitis C', 'HBV', 'HCV', 'hepatitis pathology', 'chronic hepatitis', 'viral hepatitis'] },
      { canonical: 'Pancreatitis',               aliases: ['acute pancreatitis', 'chronic pancreatitis', 'pancreatic inflammation', 'gallstone pancreatitis'] },
    ],

    Hematology: [
      { canonical: 'Iron Deficiency Anemia',  aliases: ['IDA', 'microcytic anemia', 'iron deficiency', 'hypochromic microcytic anemia', 'iron-deficiency anemia'] },
      { canonical: 'Megaloblastic Anemia',    aliases: ['B12 deficiency anemia', 'folate deficiency anemia', 'macrocytic anemia', 'pernicious anemia', 'B12 deficiency', 'folate deficiency'] },
      { canonical: 'Hemolytic Anemia',        aliases: ['immune hemolytic anemia', 'Coombs-positive anemia', 'G6PD anemia', 'hereditary spherocytosis', 'hemolytic'] },
      { canonical: 'Leukemia',               aliases: ['AML', 'ALL', 'CML', 'CLL', 'acute myeloid leukemia', 'acute lymphoblastic leukemia', 'chronic lymphocytic leukemia', 'leukemic', 'acute leukemia'] },
      { canonical: 'Lymphoma',               aliases: ['Hodgkin lymphoma', 'non-Hodgkin lymphoma', 'NHL', 'diffuse large B cell lymphoma', 'DLBCL', 'Hodgkin\'s lymphoma'] },
      { canonical: 'Sickle Cell Disease',    aliases: ['sickle cell anemia', 'HbS', 'hemoglobin S', 'sickle cell crisis', 'sickle cell trait', 'sickling'] },
      { canonical: 'Coagulopathy',           aliases: ['DIC', 'disseminated intravascular coagulation', 'thrombocytopenia', 'platelet disorder', 'bleeding disorder'] },
    ],

    Multisystem: [
      { canonical: 'Systemic Lupus Erythematosus', aliases: ['SLE', 'lupus', 'anti-dsDNA', 'anti-Smith antibody', 'butterfly rash', 'lupus erythematosus'] },
      { canonical: 'Sarcoidosis',                  aliases: ['sarcoid', 'noncaseating granulomas', 'bilateral hilar lymphadenopathy', 'BHL', 'sarcoidosis disease'] },
      { canonical: 'Amyloidosis',                  aliases: ['amyloid', 'AL amyloidosis', 'AA amyloidosis', 'Congo red staining', 'amyloid deposition'] },
    ],

  },

  // ════════════════════════════════════════════════════════════════════════════
  // PHYSIOLOGY
  // ════════════════════════════════════════════════════════════════════════════

  Physiology: {

    Cardiovascular: [
      { canonical: 'Cardiac Action Potential',   aliases: ['action potential cardiac', 'myocardial action potential', 'fast action potential', 'slow action potential', 'ventricular action potential'] },
      { canonical: 'Frank-Starling Mechanism',   aliases: ['Starling law', 'cardiac preload', 'Starling curve', 'Frank-Starling law', 'cardiac length-tension'] },
      { canonical: 'Cardiac Output',             aliases: ['heart rate stroke volume', 'CO hemodynamics', 'hemodynamic parameters', 'cardiac output regulation', 'stroke volume'] },
      { canonical: 'Blood Pressure Regulation',  aliases: ['blood pressure control', 'baroreceptor reflex', 'autoregulation', 'sympathetic blood pressure', 'hypertension physiology'] },
      { canonical: 'Electrocardiogram',          aliases: ['ECG', 'EKG', 'rhythm interpretation', 'ECG interpretation', 'cardiac rhythm', 'electrocardiography'] },
    ],

    'Renal / Urinary': [
      { canonical: 'Acid-Base Balance',           aliases: ['acid-base disorders', 'metabolic acidosis', 'respiratory acidosis', 'metabolic alkalosis', 'respiratory alkalosis', 'anion gap', 'acid base'] },
      { canonical: 'Glomerular Filtration Rate',  aliases: ['GFR', 'renal clearance', 'clearance calculation', 'filtration fraction', 'creatinine clearance', 'inulin clearance'] },
      { canonical: 'Tubular Transport',           aliases: ['renal tubular reabsorption', 'tubular secretion', 'transport maximum', 'Tm renal', 'proximal tubule function', 'tubular physiology'] },
      { canonical: 'Fluid and Electrolytes',      aliases: ['sodium balance', 'potassium balance', 'water balance', 'hyponatremia', 'hyperkalemia', 'SIADH', 'fluid balance'] },
      { canonical: 'Renin-Angiotensin-Aldosterone System', aliases: ['RAAS', 'renin system', 'aldosterone regulation', 'angiotensin II', 'renin angiotensin', 'aldosterone physiology'] },
    ],

    Respiratory: [
      { canonical: 'Ventilation-Perfusion Matching', aliases: ['V/Q ratio', 'V/Q mismatch', 'dead space', 'shunt', 'physiologic shunt', 'VQ mismatch', 'ventilation perfusion'] },
      { canonical: 'Respiratory Mechanics',         aliases: ['lung compliance', 'surfactant', 'lung volumes', 'FVC', 'FEV1', 'TLC', 'spirometry', 'pulmonary mechanics'] },
      { canonical: 'Oxygen Transport',             aliases: ['hemoglobin oxygen affinity', 'oxyhemoglobin dissociation curve', 'oxygen-hemoglobin curve', 'Bohr effect', 'O2 dissociation', 'hemoglobin saturation'] },
      { canonical: 'Carbon Dioxide Transport',     aliases: ['CO2 transport', 'carbonic anhydrase', 'bicarbonate buffer system', 'Haldane effect', 'carbon dioxide physiology'] },
    ],

  },

  // ════════════════════════════════════════════════════════════════════════════
  // MICROBIOLOGY
  // ════════════════════════════════════════════════════════════════════════════

  Microbiology: {

    Respiratory: [
      { canonical: 'Streptococcus Pneumoniae',       aliases: ['S. pneumoniae', 'pneumococcal', 'pneumococcus', 'Streptococcus pneumoniae respiratory'] },
      { canonical: 'Tuberculosis',                   aliases: ['TB', 'Mycobacterium tuberculosis', 'MTB', 'active TB', 'latent TB', 'LTBI', 'mycobacterial infection'] },
      { canonical: 'Influenza Virus',                aliases: ['influenza', 'flu virus', 'H1N1', 'influenza A', 'influenza B', 'seasonal flu'] },
      { canonical: 'Pneumocystis Jirovecii Pneumonia', aliases: ['PCP', 'Pneumocystis pneumonia', 'PJP', 'Pneumocystis jirovecii'] },
      { canonical: 'Atypical Pneumonia',             aliases: ['atypical pneumonias', 'Mycoplasma pneumoniae', 'Chlamydophila pneumoniae', 'Legionella', 'walking pneumonia', 'Legionella pneumophila'] },
    ],

    Gastrointestinal: [
      { canonical: 'Helicobacter Pylori',     aliases: ['H. pylori', 'H pylori', 'Helicobacter pylori infection', 'H pylori infection'] },
      { canonical: 'Clostridioides Difficile', aliases: ['C. diff', 'C. difficile', 'Clostridium difficile', 'pseudomembranous colitis', 'C diff colitis', 'CDI'] },
      { canonical: 'Enteric Pathogens',       aliases: ['Salmonella', 'Shigella', 'E. coli O157', 'enterohemorrhagic E. coli', 'campylobacter', 'foodborne illness', 'Salmonella typhi', 'Shigella dysentery'] },
      { canonical: 'Viral Gastroenteritis',   aliases: ['norovirus', 'rotavirus', 'viral diarrhea', 'gastroenteritis viral', 'noroviral gastroenteritis'] },
    ],

    'Infectious Disease': [
      { canonical: 'Staphylococcus Aureus',      aliases: ['S. aureus', 'MRSA', 'methicillin-resistant Staphylococcus aureus', 'staph aureus', 'staph infection', 'MSSA'] },
      { canonical: 'Sepsis and Bacteremia',      aliases: ['bacteremia', 'septic shock', 'gram-negative sepsis', 'gram-positive sepsis', 'SIRS', 'systemic infection'] },
      { canonical: 'Sexually Transmitted Infections', aliases: ['STI', 'gonorrhea', 'syphilis', 'chlamydia', 'STDs', 'Neisseria gonorrhoeae', 'Treponema pallidum', 'Chlamydia trachomatis', 'STD'] },
      { canonical: 'Herpes Virus Infections',   aliases: ['HSV', 'herpes simplex', 'CMV', 'EBV', 'varicella-zoster', 'VZV', 'cytomegalovirus', 'herpesvirus', 'Epstein-Barr virus'] },
    ],

    Multisystem: [
      { canonical: 'HIV and AIDS',                 aliases: ['human immunodeficiency virus', 'AIDS', 'ART', 'antiretroviral therapy', 'CD4 count', 'opportunistic infections', 'HIV infection'] },
      { canonical: 'Disseminated Fungal Infections', aliases: ['histoplasmosis', 'cryptococcosis', 'aspergillosis', 'disseminated candidiasis', 'systemic fungal', 'cryptococcal meningitis'] },
    ],

  },

  // ════════════════════════════════════════════════════════════════════════════
  // IMMUNOLOGY
  // ════════════════════════════════════════════════════════════════════════════

  Immunology: {

    Multisystem: [
      { canonical: 'Type I Hypersensitivity',  aliases: ['IgE-mediated hypersensitivity', 'atopy', 'anaphylaxis', 'allergic reaction', 'immediate hypersensitivity', 'type 1 hypersensitivity'] },
      { canonical: 'Type II Hypersensitivity', aliases: ['antibody-mediated cytotoxicity', 'cytotoxic hypersensitivity', 'hemolytic transfusion reaction', 'type 2 hypersensitivity'] },
      { canonical: 'Type III Hypersensitivity', aliases: ['immune complex disease', 'serum sickness', 'Arthus reaction', 'type 3 hypersensitivity', 'immune complex hypersensitivity'] },
      { canonical: 'Type IV Hypersensitivity', aliases: ['delayed-type hypersensitivity', 'DTH', 'contact dermatitis', 'T-cell mediated hypersensitivity', 'type 4 hypersensitivity', 'cell-mediated hypersensitivity'] },
    ],

    Immunology: [
      { canonical: 'Primary Immunodeficiencies', aliases: ['SCID', 'agammaglobulinemia', 'DiGeorge syndrome', 'Bruton disease', 'CGD', 'chronic granulomatous disease', 'XLA', 'Wiskott-Aldrich', 'common variable immunodeficiency', 'CVID'] },
      { canonical: 'Complement System',         aliases: ['complement cascade', 'complement deficiency', 'C3 complement', 'C5 complement', 'MAC', 'membrane attack complex', 'complement pathway'] },
    ],

  },

  // ════════════════════════════════════════════════════════════════════════════
  // ANATOMY
  // ════════════════════════════════════════════════════════════════════════════

  Anatomy: {

    Neurology: [
      { canonical: 'Brachial Plexus Injuries',  aliases: ['brachial plexus', 'Erb palsy', 'Klumpke palsy', 'brachial plexus lesion', 'brachial plexus injury', 'Erb\'s palsy'] },
      { canonical: 'Cranial Nerve Deficits',    aliases: ['cranial nerve lesions', 'CN III palsy', 'facial nerve palsy', 'trigeminal neuralgia', 'oculomotor nerve palsy', 'cranial neuropathy'] },
      { canonical: 'Spinal Cord Syndromes',     aliases: ['Brown-Sequard syndrome', 'anterior cord syndrome', 'central cord syndrome', 'complete cord transection', 'spinal cord injury syndromes', 'Brown-Sequard'] },
      { canonical: 'Circle of Willis',          aliases: ['cerebral vasculature', 'anterior cerebral artery', 'ACA stroke', 'middle cerebral artery', 'MCA stroke', 'posterior cerebral artery', 'PCA stroke', 'cerebral arteries'] },
    ],

    Musculoskeletal: [
      { canonical: 'Peripheral Nerve Lesions', aliases: ['nerve lesion', 'radial nerve palsy', 'ulnar nerve palsy', 'wrist drop', 'claw hand', 'ape hand', 'median nerve', 'peroneal nerve', 'peripheral neuropathy anatomy'] },
      { canonical: 'Dermatomes and Myotomes',  aliases: ['sensory dermatomes', 'motor myotomes', 'nerve root levels', 'dermatomal distribution', 'C5-T1 roots', 'L4-S1 roots'] },
    ],

  },

  // ════════════════════════════════════════════════════════════════════════════
  // GENETICS
  // ════════════════════════════════════════════════════════════════════════════

  Genetics: {

    Multisystem: [
      { canonical: 'Autosomal Dominant Disorders',  aliases: ['AD inheritance', 'dominant genetic disorders', 'autosomal dominant inheritance', 'dominant inheritance', 'Marfan syndrome genetics', 'NF1 genetics'] },
      { canonical: 'Autosomal Recessive Disorders', aliases: ['AR inheritance', 'recessive genetic disorders', 'autosomal recessive inheritance', 'recessive inheritance', 'PKU genetics', 'cystic fibrosis genetics'] },
      { canonical: 'X-linked Disorders',            aliases: ['X-linked recessive', 'hemophilia', 'Duchenne muscular dystrophy', 'DMD genetics', 'fragile X syndrome', 'X-linked inheritance'] },
      { canonical: 'Chromosomal Disorders',         aliases: ['Down syndrome', 'Turner syndrome', 'Klinefelter syndrome', 'trisomy 21', 'monosomy X', '47 XXY', 'chromosomal abnormalities', 'aneuploidy'] },
    ],

  },

  // ════════════════════════════════════════════════════════════════════════════
  // BIOCHEMISTRY
  // ════════════════════════════════════════════════════════════════════════════

  Biochemistry: {

    Multisystem: [
      { canonical: 'Amino Acid Metabolism Disorders', aliases: ['phenylalanine metabolism', 'PKU', 'phenylketonuria', 'homocystinuria', 'alkaptonuria', 'tyrosine metabolism', 'amino acid disorder'] },
      { canonical: 'Fatty Acid Metabolism',           aliases: ['beta-oxidation', 'fatty acid synthesis', 'lipid metabolism', 'MCAD deficiency', 'VLCAD', 'fatty acid oxidation'] },
      { canonical: 'Lysosomal Storage Diseases',      aliases: ['lysosomal storage disorders', 'Gaucher disease', 'Niemann-Pick disease', 'Tay-Sachs disease', 'Fabry disease', 'enzyme deficiency storage', 'sphingolipidoses'] },
      { canonical: 'Glycolysis and Krebs Cycle',      aliases: ['glucose metabolism', 'TCA cycle', 'citric acid cycle', 'pyruvate metabolism', 'glycolytic enzymes', 'Krebs cycle', 'tricarboxylic acid cycle'] },
    ],

  },

};

// ── Alias lookup map (built once at module load) ──────────────────────────────
// Maps every normalized alias key → { canonical, subject, system }
// Throws at startup if any alias key maps to two different canonicals.

interface AliasEntry extends TopicHome {
  readonly canonical: string;
}

function buildAliasLookup(): Map<string, AliasEntry> {
  const map = new Map<string, AliasEntry>();

  for (const [subject, systemMap] of Object.entries(TOPIC_TAXONOMY)) {
    for (const [system, topics] of Object.entries(systemMap)) {
      for (const entry of topics) {
        const home: AliasEntry = {
          canonical: entry.canonical,
          subject: subject as MedicaSubject,
          system: system as MedicaSystem,
        };

        const allKeys = [entry.canonical, ...entry.aliases];
        for (const raw of allKeys) {
          const k = key(raw);
          if (map.has(k)) {
            const existing = map.get(k)!;
            if (existing.canonical !== entry.canonical) {
              throw new Error(
                `[medicaTopicTaxonomy] Alias collision: key "${k}" (from "${raw}") ` +
                `maps to both "${entry.canonical}" and "${existing.canonical}"`,
              );
            }
          } else {
            map.set(k, home);
          }
        }
      }
    }
  }

  return map;
}

// Module-level singleton — any collision throws at import time (caught by tests + startup).
const ALIAS_LOOKUP: ReadonlyMap<string, AliasEntry> = buildAliasLookup();

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Look up a raw topic string and return its canonical form with home Subject × System.
 * Returns null if the topic is not in the taxonomy (unknown — emit WARN, not FAIL).
 */
export function lookupTopic(raw: string): TopicLookupResult | null {
  if (!raw || !raw.trim()) return null;
  const k = key(raw.trim());
  const entry = ALIAS_LOOKUP.get(k);
  if (!entry) return null;
  return {
    canonical: entry.canonical,
    subject: entry.subject,
    system: entry.system,
    wasAlias: k !== key(entry.canonical),
  };
}

/**
 * Normalize a raw topic string to its canonical form.
 * Returns the canonical string if found, or null if unknown.
 * Does NOT create new canonicals — unknown topics return null.
 */
export function normalizeTopic(raw: string): string | null {
  return lookupTopic(raw)?.canonical ?? null;
}

/**
 * Returns all TopicEntry records for a given Subject × System pair.
 * Returns an empty array if the pair is not in the taxonomy.
 */
export function getTopicsForSubjectSystem(
  subject: MedicaSubject,
  system: MedicaSystem,
): readonly TopicEntry[] {
  return (TOPIC_TAXONOMY[subject] as Record<string, readonly TopicEntry[]> | undefined)?.[system] ?? [];
}

/**
 * Returns the other topics in the same Subject × System pair as the given canonical topic.
 * Useful for surfacing related concepts in UI or adaptive recommendations.
 */
export function getRelatedTopics(canonical: string): readonly TopicEntry[] {
  const result = lookupTopic(canonical);
  if (!result) return [];
  return getTopicsForSubjectSystem(result.subject, result.system)
    .filter(t => t.canonical !== canonical);
}

/**
 * Returns true if a canonical exists for this raw string AND it lives in the given pair.
 */
export function isValidTopicForPair(
  raw: string,
  subject: MedicaSubject,
  system: MedicaSystem,
): boolean {
  const result = lookupTopic(raw);
  return result !== null && result.subject === subject && result.system === system;
}

/**
 * Returns the total number of canonical topics in the taxonomy.
 * Used in tests to verify taxonomy completeness.
 */
export function getTotalTopicCount(): number {
  let count = 0;
  for (const systemMap of Object.values(TOPIC_TAXONOMY)) {
    for (const topics of Object.values(systemMap)) {
      count += topics.length;
    }
  }
  return count;
}

/**
 * Returns all Subject × System pairs defined in the taxonomy.
 */
export function getTaxonomyPairs(): Array<{ subject: MedicaSubject; system: MedicaSystem }> {
  const pairs: Array<{ subject: MedicaSubject; system: MedicaSystem }> = [];
  for (const [subject, systemMap] of Object.entries(TOPIC_TAXONOMY)) {
    for (const system of Object.keys(systemMap)) {
      pairs.push({ subject: subject as MedicaSubject, system: system as MedicaSystem });
    }
  }
  return pairs;
}

/**
 * Verify all taxonomy pairs are allowed/warning in the USMLE matrix (not invalid).
 * Throws if any pair is classified as 'invalid'. Called from integrity tests.
 */
export function assertAllPairsInMatrix(): void {
  for (const { subject, system } of getTaxonomyPairs()) {
    const status = getPairStatus(subject, system);
    if (status === 'invalid') {
      throw new Error(
        `[medicaTopicTaxonomy] Pair "${subject}" × "${system}" is INVALID in the USMLE matrix. ` +
        `Remove or reassign its topics.`,
      );
    }
  }
}
