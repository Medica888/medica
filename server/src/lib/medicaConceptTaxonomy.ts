/**
 * Medica USMLE Step 1 Concept Taxonomy — v8.0.0
 *
 * Canonical concept registry scoped to Subject × System × Topic triples.
 * Every canonical concept belongs to EXACTLY ONE topic — no duplicates, no alias collisions.
 *
 * ~250 high-yield Step 1 concepts across 138 topics.
 * Basis: First Aid 2025, UWorld educational objectives, NBME high-yield emphasis.
 *
 * Discovery mode: unknown concepts WARN, not FAIL (see conceptValidator.ts).
 * FAIL only when concept's home differs in BOTH subject AND system from the tagged pair.
 * Alias match → WARN (not PASS) — concept recognized after normalization.
 */

import type { MedicaSubject, MedicaSystem } from './medicaTaxonomy.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ConceptEntry {
  readonly canonical: string;
  readonly aliases: readonly string[];
  /** Pairs where this concept is legitimate even though its home subject+system differ in both dims. */
  readonly alsoAllowedIn?: ReadonlyArray<{ subject: MedicaSubject; system: MedicaSystem }>;
}

export interface ConceptHome {
  readonly subject: MedicaSubject;
  readonly system: MedicaSystem;
  readonly topic: string;
}

export interface ConceptLookupResult extends ConceptHome {
  readonly canonical: string;
  /** True when raw input matched an alias key, not the canonical key itself. Alias match → WARN. */
  readonly wasAlias: boolean;
  readonly alsoAllowedIn?: ReadonlyArray<{ subject: MedicaSubject; system: MedicaSystem }>;
}

// ── Key normalization (mirrors medicaTopicTaxonomy.ts) ─────────────────────────

function key(s: string): string {
  return s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '');
}

// ── Taxonomy data: Subject → System → TopicCanonical → ConceptEntry[] ─────────
// TopicCanonical keys must match canonical names from medicaTopicTaxonomy.ts.

const CONCEPT_TAXONOMY: Readonly<Record<string, Readonly<Record<string, Readonly<Record<string, readonly ConceptEntry[]>>>>>> = {

  // ══════════════════════════════════════════════════════════════════════════
  // PHARMACOLOGY
  // ══════════════════════════════════════════════════════════════════════════

  Pharmacology: {

    Cardiovascular: {
      'ACE Inhibitors': [
        { canonical: 'ACE Inhibitor Cough', aliases: ['bradykinin cough', 'dry cough ace inhibitor', 'ACEI cough mechanism', 'bradykinin accumulation cough'] },
        { canonical: 'ACE Inhibitor Hyperkalemia', aliases: ['ACEI hyperkalemia', 'potassium retention ace inhibitor', 'aldosterone suppression ACEI', 'hyperkalemia ACEI mechanism'] },
        { canonical: 'ACE Inhibitor Angioedema', aliases: ['bradykinin angioedema', 'ACEI angioedema', 'angioedema from ACE inhibitors'] },
        { canonical: 'ACE Inhibitor Renal Protection', aliases: ['ACEI diabetic nephropathy', 'ACEI proteinuria reduction', 'efferent arteriole dilation ACE inhibitor'] },
      ],
      'Beta Blockers': [
        { canonical: 'Beta-1 Receptor Selectivity', aliases: ['cardioselective beta blocker', 'beta1 selective', 'selective vs nonselective beta blocker', 'metoprolol selectivity'] },
        { canonical: 'Beta Blocker Negative Chronotropy', aliases: ['heart rate reduction beta blocker', 'negative inotrope beta blocker', 'AV node beta blockade', 'negative dromotrope'] },
        { canonical: 'Beta Blocker Contraindications', aliases: ['beta blocker asthma contraindication', 'beta blocker COPD', 'beta blocker AV block contraindication', 'propranolol asthma'] },
      ],
      'Calcium Channel Blockers': [
        { canonical: 'Dihydropyridine vs Nondihydropyridine CCB', aliases: ['amlodipine vs verapamil', 'DHP vs non-DHP', 'verapamil heart rate', 'amlodipine vasodilation', 'calcium channel blocker selectivity'] },
        { canonical: 'CCB Reflex Tachycardia', aliases: ['dihydropyridine reflex tachycardia', 'amlodipine tachycardia', 'calcium channel blocker reflex tachycardia'] },
      ],
      'Statins': [
        { canonical: 'HMG-CoA Reductase Inhibition', aliases: ['statin mechanism', 'HMG CoA reductase inhibitor', 'cholesterol synthesis inhibition statin', 'mevalonate pathway statin'] },
        { canonical: 'Statin Myopathy', aliases: ['statin rhabdomyolysis', 'statin myositis', 'rhabdomyolysis statin', 'statin muscle toxicity', 'myopathy statin'] },
      ],
      'Digoxin': [
        { canonical: 'Digoxin Mechanism', aliases: ['Na-K ATPase inhibition digoxin', 'cardiac glycoside mechanism', 'digoxin sodium potassium pump', 'digoxin positive inotrope'] },
        { canonical: 'Digoxin Toxicity', aliases: ['digoxin toxicity symptoms', 'digitalis toxicity', 'digoxin arrhythmia', 'yellow-green halos digoxin', 'digoxin AV block'] },
      ],
      'Antiarrhythmics': [
        { canonical: 'Vaughan-Williams Classification', aliases: ['antiarrhythmic drug classes', 'class I II III IV antiarrhythmic', 'Singh-Vaughan Williams', 'antiarrhythmic classification'] },
        { canonical: 'Amiodarone Toxicity', aliases: ['amiodarone pulmonary toxicity', 'amiodarone thyroid toxicity', 'amiodarone liver toxicity', 'amiodarone adverse effects', 'corneal microdeposits amiodarone'] },
        { canonical: 'Class IA Proarrhythmia', aliases: ['quinidine proarrhythmia', 'QT prolongation class IA', 'torsades de pointes quinidine', 'class IA antiarrhythmic proarrhythmia'] },
      ],
      'Nitrates': [
        { canonical: 'Nitrate Vasodilation Mechanism', aliases: ['nitric oxide vasodilation', 'nitroglycerin mechanism', 'cGMP smooth muscle relaxation', 'organic nitrate mechanism'] },
        { canonical: 'Nitrate Tolerance', aliases: ['organic nitrate tolerance', 'Monday disease nitrate', 'nitrate-free interval', 'continuous nitrate tolerance'] },
      ],
      'Thiazide Diuretics': [
        { canonical: 'DCT Sodium Chloride Cotransporter Blockade', aliases: ['NCC blockade thiazide', 'distal convoluted tubule thiazide mechanism', 'thiazide DCT sodium', 'thiazide mechanism sodium'] },
        { canonical: 'Thiazide Hypokalemia', aliases: ['hydrochlorothiazide hypokalemia', 'thiazide potassium wasting', 'HCTZ hypokalemia', 'thiazide diuretic hypokalemia'] },
        { canonical: 'Thiazide Hypercalcemia', aliases: ['thiazide calcium retention', 'hydrochlorothiazide hypercalcemia', 'HCTZ hypercalcemia', 'thiazide calcium reabsorption'] },
      ],
    },

    'Renal / Urinary': {
      'Loop Diuretics': [
        { canonical: 'Na-K-2Cl Transporter Inhibition', aliases: ['NKCC2 inhibition', 'loop diuretic mechanism', 'sodium potassium chloride cotransporter blockade', 'thick ascending limb loop diuretic', 'TAL loop diuretic'] },
        { canonical: 'Loop Diuretic Ototoxicity', aliases: ['furosemide ototoxicity', 'loop diuretic hearing loss', 'furosemide tinnitus', 'ethacrynic acid ototoxicity', 'aminoglycoside loop diuretic ototoxicity'] },
        { canonical: 'Loop Diuretic Hypokalemia', aliases: ['furosemide hypokalemia', 'loop diuretic potassium wasting', 'torsemide hypokalemia', 'hypokalemia from loop diuretics'] },
        { canonical: 'Sulfa Allergy Cross-Reactivity', aliases: ['loop diuretic sulfa allergy', 'furosemide sulfonamide allergy', 'thiazide sulfa cross-reactivity', 'sulfonamide furosemide allergy'] },
      ],
      'Potassium-Sparing Diuretics': [
        { canonical: 'Aldosterone Receptor Antagonism', aliases: ['spironolactone mechanism', 'mineralocorticoid receptor blockade', 'aldosterone antagonist mechanism', 'eplerenone mechanism'] },
        { canonical: 'Spironolactone Gynecomastia', aliases: ['spironolactone side effects', 'spironolactone anti-androgen', 'spironolactone gynecomastia mechanism', 'aldosterone antagonist gynecomastia'] },
      ],
      'SGLT2 Inhibitors': [
        { canonical: 'SGLT2 Glucosuria Mechanism', aliases: ['sodium glucose transporter inhibition', 'empagliflozin mechanism', 'SGLT2 renal glucose excretion', 'flozin mechanism', 'SGLT2 proximal tubule'] },
        { canonical: 'SGLT2 Cardiovascular Renal Benefits', aliases: ['empagliflozin heart failure', 'SGLT2 inhibitor renal protection', 'SGLT2 inhibitor outcomes', 'flozin cardiovascular benefit'] },
      ],
      'NSAIDs and Renal Toxicity': [
        { canonical: 'NSAID Prostaglandin Inhibition in Kidney', aliases: ['NSAID renal prostaglandin', 'COX inhibition kidney', 'NSAID afferent arteriole constriction', 'prostaglandin renal blood flow'] },
        { canonical: 'NSAID-Induced Acute Kidney Injury', aliases: ['NSAID AKI', 'ibuprofen acute renal failure', 'NSAID nephrotoxicity mechanism', 'analgesic nephropathy NSAID'] },
      ],
      'Contrast-Induced Nephropathy': [
        { canonical: 'Contrast Nephropathy Prevention', aliases: ['N-acetylcysteine contrast', 'IV hydration contrast nephropathy', 'NAC contrast nephropathy', 'contrast induced AKI prevention'] },
      ],
    },

    Neurology: {
      'Antiepileptics': [
        { canonical: 'Antiepileptic Sodium Channel Blockade', aliases: ['phenytoin sodium channel', 'carbamazepine sodium channel', 'sodium channel antiepileptic mechanism', 'anticonvulsant sodium channel'] },
        { canonical: 'Phenytoin Toxicity', aliases: ['phenytoin nystagmus ataxia', 'dilantin toxicity', 'phenytoin adverse effects', 'phenytoin gingival hyperplasia', 'phenytoin SLE-like'] },
        { canonical: 'Valproate Adverse Effects', aliases: ['valproate hepatotoxicity', 'valproate teratogenicity', 'valproate weight gain', 'valproic acid liver toxicity', 'neural tube defect valproate'] },
      ],
      'Parkinson Disease Drugs': [
        { canonical: 'Levodopa Mechanism', aliases: ['levodopa dopamine precursor', 'L-DOPA mechanism', 'carbidopa levodopa mechanism', 'levodopa CNS dopamine', 'levodopa BBB crossing'] },
        { canonical: 'On-Off Phenomenon Levodopa', aliases: ['levodopa motor fluctuations', 'levodopa wearing off', 'end-of-dose deterioration', 'dyskinesia levodopa', 'wearing-off phenomenon'] },
      ],
      'Opioid Analgesics': [
        { canonical: 'Opioid Receptor Pharmacology', aliases: ['mu opioid receptor', 'kappa delta opioid receptor', 'opioid receptor types', 'mu kappa delta receptors', 'opioid receptor agonist'] },
        { canonical: 'Opioid Overdose Triad', aliases: ['pinpoint pupils opioid', 'respiratory depression opioid', 'opioid toxidrome', 'opioid overdose miosis', 'morphine overdose triad'] },
        { canonical: 'Naloxone Opioid Reversal', aliases: ['naloxone mechanism', 'narcan mechanism', 'opioid antagonist naloxone', 'naloxone reversal opioid'] },
      ],
      'Local Anesthetics': [
        { canonical: 'Local Anesthetic Sodium Channel Block', aliases: ['lidocaine mechanism', 'local anesthetic mechanism', 'use-dependent sodium channel block', 'nerve fiber block order local anesthetic'] },
        { canonical: 'Ester vs Amide Local Anesthetic', aliases: ['amide local anesthetic', 'ester local anesthetic', 'procaine vs lidocaine', 'amide vs ester hydrolysis', 'local anesthetic classification'] },
      ],
      'Migraine Drugs': [
        { canonical: 'Triptan Mechanism', aliases: ['sumatriptan mechanism', '5-HT1B 1D agonist', 'serotonin triptan mechanism', 'triptan cranial vasodilation', 'sumatriptan serotonin'] },
      ],
    },

    Psychiatry: {
      'Antidepressants': [
        { canonical: 'SSRI Serotonin Syndrome', aliases: ['serotonin syndrome SSRI', 'serotonin toxicity', 'serotonin excess symptoms', 'hyperthermia serotonin syndrome', 'serotonin syndrome triad'],
          alsoAllowedIn: [{ subject: 'Pharmacology', system: 'Neurology' }] },
        { canonical: 'TCA Toxicity Sodium Channel Blockade', aliases: ['tricyclic antidepressant toxicity', 'TCA overdose QRS widening', 'amitriptyline toxicity', 'TCA overdose sodium bicarbonate', 'tricyclic QRS prolongation'] },
        { canonical: 'MAOI Tyramine Interaction', aliases: ['tyramine cheese reaction', 'MAO inhibitor food interaction', 'MAOI hypertensive crisis', 'tyramine hypertensive crisis', 'MAOI dietary restriction'] },
      ],
      'Antipsychotics': [
        { canonical: 'Dopamine D2 Receptor Blockade', aliases: ['antipsychotic D2 blockade', 'neuroleptic dopamine blockade', 'D2 antagonism antipsychotic mechanism', 'haloperidol D2 blockade'] },
        { canonical: 'Neuroleptic Malignant Syndrome', aliases: ['NMS antipsychotic', 'neuroleptic malignant syndrome symptoms', 'NMS hyperthermia rigidity', 'antipsychotic hyperthermia', 'NMS treatment dantrolene'] },
        { canonical: 'Tardive Dyskinesia', aliases: ['antipsychotic tardive dyskinesia', 'TD antipsychotic long-term', 'tardive dyskinesia mechanism', 'orofacial movements tardive dyskinesia'] },
      ],
      'Anxiolytics and Sedatives': [
        { canonical: 'Benzodiazepine GABA-A Potentiation', aliases: ['GABA-A chloride channel benzodiazepine', 'BZD GABA mechanism', 'benzodiazepine frequency chloride', 'diazepam GABA mechanism'] },
        { canonical: 'Barbiturate vs Benzodiazepine Overdose', aliases: ['barbiturate overdose comparison', 'BZD vs barbiturate safety', 'benzodiazepine overdose flumazenil', 'barbiturate respiratory depression'] },
      ],
      'Mood Stabilizers': [
        { canonical: 'Lithium Toxicity', aliases: ['lithium toxicity symptoms', 'lithium tremor toxicity', 'lithium narrow therapeutic index', 'lithium neurotoxicity', 'lithium overdose signs'] },
        { canonical: 'Lithium Thyroid and Renal Side Effects', aliases: ['lithium nephrogenic DI', 'lithium hypothyroidism', 'lithium renal side effects', 'nephrogenic diabetes insipidus lithium'] },
      ],
      'ADHD Medications': [
        { canonical: 'Amphetamine Dopamine Norepinephrine Release', aliases: ['amphetamine mechanism', 'ADHD stimulant mechanism', 'amphetamine catecholamine release', 'methylphenidate reuptake inhibition', 'stimulant mechanism ADHD'] },
      ],
    },

    Endocrine: {
      'Insulin': [
        { canonical: 'Insulin GLUT4 Translocation', aliases: ['insulin mechanism GLUT4', 'insulin receptor glucose uptake', 'insulin glucose transporter', 'GLUT4 insulin-dependent uptake'] },
        { canonical: 'Insulin-Induced Hypokalemia', aliases: ['insulin potassium shift', 'insulin hypokalemia DKA', 'insulin potassium cellular uptake', 'insulin K shift treatment'] },
        { canonical: 'Hypoglycemia from Insulin', aliases: ['insulin hypoglycemia', 'insulin overdose hypoglycemia', 'counter-regulatory hormones hypoglycemia', 'glucagon response hypoglycemia'] },
      ],
      'Oral Hypoglycemics': [
        { canonical: 'Metformin AMPK Activation', aliases: ['metformin mechanism', 'biguanide AMPK', 'metformin hepatic glucose', 'metformin lactic acidosis', 'biguanide mechanism'] },
        { canonical: 'Sulfonylurea K-ATP Channel Closure', aliases: ['sulfonylurea mechanism', 'K-ATP channel insulin secretion', 'glipizide mechanism', 'sulfonylurea beta cell depolarization'] },
      ],
      'Thyroid Drugs': [
        { canonical: 'PTU vs Methimazole in Pregnancy', aliases: ['propylthiouracil pregnancy', 'methimazole teratogen', 'antithyroid drug pregnancy', 'PTU first trimester', 'methimazole aplasia cutis'] },
        { canonical: 'Levothyroxine Dosing Principles', aliases: ['T4 replacement therapy', 'levothyroxine monitoring', 'TSH-guided levothyroxine', 'thyroid replacement monitoring'] },
      ],
      'Corticosteroids': [
        { canonical: 'Glucocorticoid HPA Suppression', aliases: ['HPA axis suppression steroid', 'adrenal suppression corticosteroid', 'hypothalamic pituitary adrenal corticosteroid', 'steroid taper HPA'] },
        { canonical: 'Corticosteroid Adverse Effects', aliases: ['steroid side effects', 'glucocorticoid Cushingoid', 'corticosteroid hyperglycemia osteoporosis', 'steroid adverse effects', 'immunosuppression corticosteroid'] },
      ],
      'Bisphosphonates': [
        { canonical: 'Bisphosphonate Osteoclast Inhibition', aliases: ['bisphosphonate mechanism', 'alendronate mechanism', 'osteoclast inhibition bisphosphonate', 'bisphosphonate anti-resorptive'] },
        { canonical: 'Bisphosphonate Esophagitis', aliases: ['alendronate esophagitis', 'bisphosphonate GI side effects', 'oral bisphosphonate esophageal irritation', 'bisphosphonate upright posture'] },
      ],
      'Hormonal Contraceptives': [
        { canonical: 'OCP Ovulation Suppression', aliases: ['oral contraceptive mechanism', 'estrogen progestin ovulation inhibition', 'combined OCP LH suppression', 'contraceptive pill ovulation'] },
        { canonical: 'OCP Venous Thromboembolism Risk', aliases: ['oral contraceptive DVT', 'estrogen VTE risk', 'OCP thromboembolic risk', 'combined OCP coagulation'] },
      ],
    },

    Hematology: {
      'Anticoagulants': [
        { canonical: 'Heparin Antithrombin III Mechanism', aliases: ['heparin mechanism antithrombin', 'UFH antithrombin III', 'heparin factor Xa IIa', 'low molecular weight heparin mechanism'] },
        { canonical: 'Warfarin Vitamin K Antagonism', aliases: ['warfarin mechanism', 'vitamin K epoxide reductase inhibition', 'warfarin clotting factors', 'coumadin mechanism', 'factors II VII IX X warfarin'] },
        { canonical: 'Warfarin Drug Interactions', aliases: ['warfarin drug interactions CYP450', 'warfarin INR change', 'anticoagulant drug interaction', 'warfarin food drug interaction'] },
      ],
      'Thrombolytics': [
        { canonical: 'tPA Plasminogen Activation', aliases: ['alteplase mechanism', 'tissue plasminogen activator mechanism', 'fibrinolytic mechanism', 'streptokinase plasminogen', 'tPA clot lysis'] },
        { canonical: 'tPA Contraindications', aliases: ['thrombolytic contraindications', 'tPA stroke contraindications', 'fibrinolytic absolute contraindications', 'recent surgery tPA contraindication'] },
      ],
      'Antiplatelet Drugs': [
        { canonical: 'Aspirin COX Irreversible Inhibition', aliases: ['aspirin mechanism', 'irreversible COX inhibition aspirin', 'thromboxane A2 aspirin', 'aspirin antiplatelet mechanism', 'aspirin TXA2'] },
        { canonical: 'Clopidogrel P2Y12 Inhibition', aliases: ['clopidogrel mechanism', 'P2Y12 receptor blockade', 'ADP receptor blockade clopidogrel', 'thienopyridine mechanism', 'ticagrelor P2Y12'] },
      ],
      'Iron Supplementation': [
        { canonical: 'Duodenal Iron Absorption', aliases: ['ferrous iron absorption', 'DMT1 iron transport', 'vitamin C iron absorption', 'duodenum iron uptake', 'iron absorption mechanism'] },
      ],
      'Erythropoiesis-Stimulating Agents': [
        { canonical: 'Erythropoietin CKD Mechanism', aliases: ['EPO mechanism CKD', 'erythropoietin stimulating agent CKD', 'ESA anemia of chronic disease', 'darbepoetin mechanism', 'EPO bone marrow stimulation'] },
      ],
    },

    Respiratory: {
      'Bronchodilators': [
        { canonical: 'Beta-2 Agonist Bronchodilation', aliases: ['albuterol mechanism', 'SABA mechanism', 'beta2 agonist cAMP smooth muscle', 'bronchodilator mechanism', 'salmeterol mechanism'] },
        { canonical: 'Beta-2 Agonist Hypokalemia', aliases: ['albuterol hypokalemia', 'beta2 agonist potassium shift', 'SABA hypokalemia', 'bronchodilator hypokalemia'] },
      ],
      'Inhaled Corticosteroids': [
        { canonical: 'ICS Mechanism vs Systemic Steroids', aliases: ['inhaled corticosteroid vs systemic', 'ICS local anti-inflammatory', 'fluticasone mechanism', 'ICS adrenal sparing'] },
      ],
      'Leukotriene Modifiers': [
        { canonical: 'Leukotriene Receptor Antagonism', aliases: ['montelukast mechanism', 'cysteinyl leukotriene blockade', 'leukotriene modifier mechanism', 'zafirlukast mechanism'] },
      ],
      'Methylxanthines': [
        { canonical: 'Theophylline PDE Inhibition', aliases: ['theophylline mechanism', 'phosphodiesterase inhibition theophylline', 'methylxanthine mechanism', 'theophylline bronchodilation'] },
        { canonical: 'Theophylline Toxicity', aliases: ['theophylline narrow therapeutic index', 'theophylline seizures arrhythmia', 'aminophylline toxicity', 'theophylline adverse effects'] },
      ],
    },

    'Infectious Disease': {
      'Penicillins': [
        { canonical: 'Beta-Lactam Cell Wall Synthesis Inhibition', aliases: ['penicillin mechanism', 'beta-lactam mechanism', 'PBP binding penicillin', 'transpeptidase inhibition', 'peptidoglycan synthesis penicillin'] },
        { canonical: 'Penicillin Allergy and Beta-Lactam Cross-Reactivity', aliases: ['penicillin allergy cross-reactivity', 'cephalosporin penicillin allergy', 'beta-lactam allergy', 'penicillin IgE allergy'] },
      ],
      'Cephalosporins': [
        { canonical: 'Cephalosporin Generation Coverage', aliases: ['cephalosporin spectrum', 'third generation cephalosporin coverage', 'ceftriaxone spectrum', 'first vs third generation cephalosporin'] },
      ],
      'Fluoroquinolones': [
        { canonical: 'DNA Gyrase Topoisomerase Inhibition', aliases: ['fluoroquinolone mechanism', 'quinolone DNA gyrase', 'ciprofloxacin mechanism', 'topoisomerase II IV inhibition fluoroquinolone'] },
        { canonical: 'Fluoroquinolone Tendinopathy', aliases: ['quinolone tendon rupture', 'fluoroquinolone Achilles tendon', 'ciprofloxacin tendon', 'quinolone tendinitis'] },
      ],
      'Macrolides': [
        { canonical: 'Macrolide 50S Ribosome Inhibition', aliases: ['azithromycin mechanism', 'erythromycin 50S', 'macrolide ribosome mechanism', '50S subunit macrolide', 'macrolide protein synthesis inhibition'] },
        { canonical: 'Macrolide QT Prolongation', aliases: ['azithromycin QT prolongation', 'erythromycin cardiac arrhythmia', 'macrolide cardiac side effect', 'macrolide torsades'] },
      ],
      'Aminoglycosides': [
        { canonical: 'Aminoglycoside 30S Ribosome Inhibition', aliases: ['gentamicin mechanism', 'aminoglycoside 30S subunit', 'streptomycin ribosome', 'aminoglycoside protein synthesis'] },
        { canonical: 'Aminoglycoside Nephrotoxicity and Ototoxicity', aliases: ['gentamicin nephrotoxicity', 'aminoglycoside kidney toxicity', 'aminoglycoside ototoxicity', 'gentamicin hearing loss', 'aminoglycoside toxicity pair'] },
      ],
      'Antifungals': [
        { canonical: 'Ergosterol Synthesis Inhibition', aliases: ['azole antifungal mechanism', 'fluconazole mechanism', 'lanosterol to ergosterol azole', 'CYP51 azole inhibition', 'antifungal ergosterol mechanism'] },
        { canonical: 'Amphotericin B Nephrotoxicity', aliases: ['amphotericin nephrotoxicity', 'amphotericin B renal toxicity', 'amphotericin B adverse effects', 'liposomal amphotericin nephrotoxicity'] },
      ],
    },

  },

  // ══════════════════════════════════════════════════════════════════════════
  // PATHOLOGY
  // ══════════════════════════════════════════════════════════════════════════

  Pathology: {

    Cardiovascular: {
      'Atherosclerosis': [
        { canonical: 'Foam Cell Formation', aliases: ['foam cell atherosclerosis', 'oxidized LDL macrophage', 'fatty streak formation', 'macrophage lipid uptake atherosclerosis'] },
        { canonical: 'Vulnerable Plaque Rupture', aliases: ['plaque rupture atherosclerosis', 'acute coronary syndrome plaque', 'thin-cap fibroatheroma', 'unstable plaque rupture'] },
      ],
      'Myocardial Infarction': [
        { canonical: 'MI Histological Timeline', aliases: ['myocardial infarction histology timeline', 'MI neutrophils macrophages', 'cardiac necrosis histology', 'coagulative necrosis MI', 'MI healing phases'] },
        { canonical: 'Post-MI Complications', aliases: ['MI complications', 'ventricular free wall rupture', 'papillary muscle rupture MI', 'Dressler syndrome', 'post-MI pericarditis', 'MI mural thrombus'] },
        { canonical: 'Transmural vs Subendocardial MI', aliases: ['STEMI vs NSTEMI pathology', 'transmural infarction', 'subendocardial ischemia', 'full thickness MI'] },
      ],
      'Heart Failure': [
        { canonical: 'Systolic vs Diastolic Dysfunction', aliases: ['heart failure reduced ejection fraction', 'HFrEF vs HFpEF', 'systolic heart failure EF', 'diastolic dysfunction normal EF'] },
        { canonical: 'Neurohormonal Compensation Heart Failure', aliases: ['heart failure compensation RAAS', 'sympathetic activation heart failure', 'BNP heart failure', 'neurohormonal activation CHF'] },
      ],
      'Cardiomyopathy': [
        { canonical: 'Dilated vs Hypertrophic vs Restrictive Cardiomyopathy', aliases: ['cardiomyopathy types', 'DCM vs HCM pathology', 'restrictive cardiomyopathy amyloid', 'cardiomyopathy classification'] },
        { canonical: 'HCM Outflow Tract Obstruction', aliases: ['hypertrophic cardiomyopathy LVOT', 'SAM mitral valve HCM', 'asymmetric septal hypertrophy', 'HCM sudden death athlete'] },
      ],
      'Valvular Heart Disease': [
        { canonical: 'Aortic Stenosis Murmur and Hemodynamics', aliases: ['aortic stenosis crescendo-decrescendo', 'AS systolic murmur', 'aortic stenosis angina syncope dyspnea', 'calcific aortic stenosis'] },
        { canonical: 'Mitral Regurgitation Mechanism', aliases: ['mitral regurgitation causes', 'MR holosystolic murmur', 'mitral valve prolapse regurgitation', 'chronic vs acute mitral regurgitation'] },
      ],
      'Endocarditis': [
        { canonical: 'Osler Nodes and Janeway Lesions', aliases: ['endocarditis skin findings', 'infective endocarditis cutaneous', 'Roth spots endocarditis', 'endocarditis peripheral stigmata'] },
        { canonical: 'Duke Criteria Endocarditis', aliases: ['infective endocarditis diagnosis', 'Duke major minor criteria', 'IE diagnostic criteria', 'endocarditis blood culture echocardiogram'] },
      ],
      'Pericarditis': [
        { canonical: 'Pericardial Friction Rub', aliases: ['pericarditis friction rub', 'pleuritic chest pain pericarditis', 'pericarditis ECG saddle-shaped ST', 'pericarditis auscultation'] },
        { canonical: 'Cardiac Tamponade Beck Triad', aliases: ['cardiac tamponade findings', 'Beck triad tamponade', 'pulsus paradoxus tamponade', 'JVD hypotension muffled sounds tamponade'] },
      ],
    },

    'Renal / Urinary': {
      'Glomerulonephritis': [
        { canonical: 'Nephritic vs Nephrotic Syndrome Distinction', aliases: ['nephritic syndrome features', 'nephrotic vs nephritic difference', 'hematuria proteinuria nephritic', 'nephritic syndrome RBC casts'] },
        { canonical: 'IgA Nephropathy Mechanism', aliases: ['Berger disease', 'IgA nephropathy hematuria', 'mesangial IgA deposition', 'gross hematuria after URI IgA'] },
      ],
      'Nephrotic Syndrome': [
        { canonical: 'Podocyte Effacement Mechanism', aliases: ['minimal change disease podocyte', 'nephrotic syndrome pathology', 'foot process effacement', 'podocyte injury nephrotic'] },
        { canonical: 'Hypoalbuminemia and Edema Mechanism', aliases: ['nephrotic hypoalbuminemia', 'pitting edema nephrotic', 'oncotic pressure nephrotic syndrome', 'hypoalbuminemia nephrotic'] },
      ],
      'Acute Kidney Injury': [
        { canonical: 'Prerenal vs Intrinsic vs Postrenal AKI', aliases: ['AKI categories', 'prerenal azotemia causes', 'intrinsic renal failure ATN', 'postrenal obstruction AKI', 'FENa AKI differentiation'] },
        { canonical: 'ATN Epithelial Casts', aliases: ['acute tubular necrosis casts', 'muddy brown casts ATN', 'renal tubular epithelial casts', 'ischemic ATN casts'] },
      ],
      'Chronic Kidney Disease': [
        { canonical: 'Uremic Complications', aliases: ['uremia symptoms', 'uremic pericarditis', 'uremic encephalopathy', 'BUN creatinine uremia', 'uremic platelet dysfunction'] },
        { canonical: 'Renal Osteodystrophy', aliases: ['secondary hyperparathyroidism CKD', 'CKD bone disease', 'renal osteodystrophy hyperphosphatemia', 'osteitis fibrosa cystica CKD'] },
      ],
      'Renal Cell Carcinoma': [
        { canonical: 'VHL Tumor Suppressor RCC', aliases: ['von Hippel-Lindau RCC', 'VHL gene clear cell RCC', 'HIF pathway RCC', 'clear cell carcinoma VHL mutation'] },
        { canonical: 'RCC Paraneoplastic Syndromes', aliases: ['RCC ectopic EPO polycythemia', 'renal cell carcinoma paraneoplastic', 'hypercalcemia RCC PTHrP', 'RCC flank pain hematuria weight loss'] },
      ],
      'Nephrolithiasis': [
        { canonical: 'Calcium Oxalate vs Uric Acid Stones', aliases: ['kidney stone types', 'calcium oxalate stone radiopaque', 'uric acid stone radiolucent', 'nephrolithiasis stone type', 'hypercalciuria stone'] },
        { canonical: 'Struvite Stones Urease Bacteria', aliases: ['staghorn calculi', 'struvite stone infection', 'urease bacteria kidney stone', 'Proteus struvite', 'triple phosphate stone'] },
      ],
    },

    Neurology: {
      'Stroke': [
        { canonical: 'Ischemic vs Hemorrhagic Stroke', aliases: ['stroke types', 'hemorrhagic vs ischemic CVA', 'lacunar infarct', 'stroke pathophysiology', 'thrombus embolus stroke'] },
        { canonical: 'MCA Stroke Syndrome', aliases: ['middle cerebral artery stroke', 'MCA infarction symptoms', 'contralateral hemiplegia MCA', 'aphasia MCA stroke', 'MCA territory findings'] },
      ],
      'Parkinson Disease': [
        { canonical: 'Lewy Body Alpha-Synuclein Pathology', aliases: ['Lewy bodies Parkinson', 'alpha-synuclein aggregation', 'Parkinson substantia nigra Lewy body', 'eosinophilic intracytoplasmic inclusion'] },
        { canonical: 'Dopaminergic Nigrostriatal Degeneration', aliases: ['substantia nigra dopamine depletion', 'nigrostriatal pathway Parkinson', 'dopamine substantia nigra loss', 'basal ganglia dopamine Parkinson'] },
      ],
      'Alzheimer Disease': [
        { canonical: 'Amyloid Beta Plaques', aliases: ['senile plaques Alzheimer', 'amyloid precursor protein AD', 'beta-amyloid plaques', 'neuritic plaques Alzheimer', 'APP mutation Alzheimer'] },
        { canonical: 'Neurofibrillary Tangles', aliases: ['tau protein Alzheimer', 'neurofibrillary tangles tau', 'hyperphosphorylated tau Alzheimer', 'intracellular tangles AD'] },
      ],
      'Multiple Sclerosis': [
        { canonical: 'CNS Demyelination Mechanism', aliases: ['oligodendrocyte loss MS', 'myelin sheath destruction MS', 'periventricular demyelination', 'MS plaques white matter'] },
        { canonical: 'Internuclear Ophthalmoplegia MS', aliases: ['MLF lesion MS', 'medial longitudinal fasciculus MS', 'INO multiple sclerosis', 'gaze palsy MS MLF'] },
        { canonical: 'Periventricular Plaques on MRI', aliases: ['MS MRI white matter lesions', 'periventricular plaques MS MRI', 'Dawson fingers MS', 'MS brain MRI findings'] },
      ],
      'Brain Tumors': [
        { canonical: 'Glioblastoma Pseudopalisading Necrosis', aliases: ['GBM pathology', 'glioblastoma multiforme histology', 'pseudopalisading necrosis GBM', 'butterfly glioma GBM', 'grade IV astrocytoma'] },
        { canonical: 'Brain Metastases vs Primary Tumors', aliases: ['metastatic brain tumors', 'brain mets primary', 'multiple brain lesions metastasis', 'brain metastasis more common than primary'] },
      ],
    },

    Endocrine: {
      'Diabetes Mellitus': [
        { canonical: 'DKA vs HHS Distinction', aliases: ['diabetic ketoacidosis vs hyperosmolar', 'DKA type 1', 'HHS type 2', 'ketones DKA HHS', 'anion gap DKA'] },
        { canonical: 'Diabetic Microvascular Complications', aliases: ['diabetic nephropathy neuropathy retinopathy', 'advanced glycation end products', 'sorbitol pathway diabetes', 'microvascular disease diabetes'] },
      ],
      'Thyroid Disorders': [
        { canonical: 'Hashimoto vs Graves Autoimmune Mechanism', aliases: ['Hashimoto anti-TPO antibody', 'Graves TSI antibody', 'autoimmune thyroiditis mechanism', 'thyroid peroxidase antibody', 'TSH receptor stimulating antibody'] },
        { canonical: 'TSH Negative Feedback Loop', aliases: ['thyroid hormone feedback', 'TRH TSH T3 T4 feedback', 'negative feedback thyroid axis', 'TSH suppression hyperthyroid'] },
      ],
      'Adrenal Disorders': [
        { canonical: 'Cushing Syndrome Hypercortisolism Features', aliases: ['Cushing syndrome findings', 'cortisol excess features', 'central obesity Cushing', 'purple striae Cushing', 'buffalo hump moon face'] },
        { canonical: 'Conn Syndrome Primary Hyperaldosteronism Hypokalemia', aliases: ['Conn syndrome hypokalemia', 'primary hyperaldosteronism hypokalemia', 'aldosterone excess hypokalemia', 'adrenal adenoma hyperaldosteronism hypokalemia'] },
        { canonical: 'Addison Disease Hyperpigmentation ACTH', aliases: ['primary adrenal insufficiency hyperpigmentation', 'ACTH excess pigmentation', 'Addison hyperpigmentation mechanism', 'adrenocortical insufficiency skin'] },
      ],
      'Hyperparathyroidism': [
        { canonical: 'Hypercalcemia Stones Bones Groans Moans', aliases: ['hypercalcemia symptoms mnemonic', 'hyperparathyroidism hypercalcemia features', 'calcium stones nephrolithiasis PTH', 'hypercalcemia clinical features'] },
        { canonical: 'PTH Osteoclast Activation Mechanism', aliases: ['PTH bone resorption', 'parathyroid hormone osteoclast', 'PTH RANKL mechanism', 'osteoclast activation PTH'] },
      ],
      'MEN Syndromes': [
        { canonical: 'MEN1 Three Ps Mnemonic', aliases: ['MEN1 pancreas parathyroid pituitary', 'MEN 1 components', 'multiple endocrine neoplasia 1', 'Wermer syndrome'] },
        { canonical: 'MEN2A vs MEN2B Features', aliases: ['MEN2A MEN2B comparison', 'RET proto-oncogene MEN2', 'medullary thyroid cancer MEN2', 'pheochromocytoma MEN2', 'MEN2A components'] },
      ],
    },

    Respiratory: {
      'Asthma': [
        { canonical: 'Bronchial Hyperreactivity Mechanism', aliases: ['asthma bronchoconstriction mechanism', 'airway hyperresponsiveness', 'mast cell degranulation asthma', 'asthma pathophysiology'] },
        { canonical: 'Charcot-Leyden Crystals Asthma', aliases: ['eosinophil asthma crystals', 'Curschmann spirals asthma', 'asthma histology findings', 'eosinophilic airway inflammation'] },
      ],
      'COPD': [
        { canonical: 'Pink Puffer vs Blue Bloater', aliases: ['emphysema vs chronic bronchitis', 'type A vs type B COPD', 'barrel chest emphysema', 'CO2 retainer chronic bronchitis', 'COPD phenotypes'] },
        { canonical: 'Alpha-1 Antitrypsin Deficiency', aliases: ['AAT deficiency emphysema', 'alpha-1 antitrypsin COPD', 'panacinar emphysema young patient', 'PiZZ A1AT deficiency', 'liver cirrhosis A1AT deficiency'] },
      ],
      'Pneumonia Pathology': [
        { canonical: 'Lobar vs Bronchopneumonia Pattern', aliases: ['pneumonia consolidation pattern', 'lobar pneumonia vs bronchopneumonia histology', 'alveolar exudate pneumonia', 'pneumonia pathological pattern'] },
      ],
      'Lung Cancer': [
        { canonical: 'Lung Cancer Histology by Type', aliases: ['squamous cell vs adenocarcinoma vs small cell', 'lung cancer histological types', 'SCLC vs NSCLC pathology', 'lung carcinoma types'] },
        { canonical: 'Small Cell Lung Cancer Paraneoplastic Syndromes', aliases: ['SCLC SIADH', 'SCLC Cushing syndrome', 'small cell paraneoplastic ectopic ADH', 'ACTH ectopic secretion SCLC', 'Eaton-Lambert SCLC'] },
      ],
      'Pulmonary Embolism': [
        { canonical: 'Virchow Triad PE Risk Factors', aliases: ['DVT PE risk factors', 'Virchow triad thrombosis', 'stasis endothelial damage hypercoagulability', 'PE predisposing factors'] },
        { canonical: 'Hampton Hump and Westermark Sign', aliases: ['PE chest x-ray findings', 'pulmonary embolism radiology', 'Westermark sign oligemia PE', 'Hampton hump wedge infarction'] },
      ],
      'Pulmonary Fibrosis': [
        { canonical: 'Honeycomb Lung Fibrosis Pattern', aliases: ['IPF honeycombing', 'idiopathic pulmonary fibrosis CT', 'usual interstitial pneumonia UIP', 'subpleural fibrosis honeycomb'] },
        { canonical: 'TGF-Beta Fibrosis Pathway', aliases: ['TGF-beta fibrosis mechanism', 'myofibroblast activation fibrosis', 'transforming growth factor fibrosis', 'TGF-beta ILD mechanism'] },
      ],
    },

    Gastrointestinal: {
      'Peptic Ulcer Disease': [
        { canonical: 'H. pylori Mucosal Damage Mechanism', aliases: ['H pylori urease peptic ulcer', 'Helicobacter pylori ulcer mechanism', 'H pylori mucosal defense', 'antral gastritis H pylori'] },
        { canonical: 'NSAID Mucosal Prostaglandin Depletion', aliases: ['NSAID peptic ulcer', 'NSAID gastric mucosal damage', 'prostaglandin mucosal protection', 'NSAIDs gastric ulcer mechanism'] },
      ],
      'Inflammatory Bowel Disease': [
        { canonical: 'Crohn Transmural vs UC Mucosal Inflammation', aliases: ['Crohn vs UC pathology', 'transmural inflammation Crohn', 'skip lesions Crohn', 'continuous mucosal UC', 'Crohn disease vs ulcerative colitis histology'] },
        { canonical: 'IBD Extraintestinal Manifestations', aliases: ['IBD extraintestinal', 'Crohn UC extraintestinal manifestations', 'pyoderma gangrenosum IBD', 'uveitis IBD', 'primary sclerosing cholangitis UC'] },
      ],
      'Colorectal Cancer': [
        { canonical: 'APC Tumor Suppressor Mutation', aliases: ['APC gene colorectal cancer', 'familial adenomatous polyposis APC', 'Wnt pathway colorectal cancer', 'APC mutation CRC', 'FAP APC'] },
        { canonical: 'Lynch Syndrome Mismatch Repair', aliases: ['HNPCC microsatellite instability', 'Lynch syndrome MLH1 MSH2', 'DNA mismatch repair colorectal', 'hereditary nonpolyposis colorectal cancer'] },
      ],
      'Liver Cirrhosis': [
        { canonical: 'Portal Hypertension Complications', aliases: ['esophageal varices portal hypertension', 'ascites portal hypertension', 'caput medusae portal hypertension', 'splenomegaly portal hypertension', 'hepatic encephalopathy cirrhosis'] },
        { canonical: 'Child-Pugh Score Cirrhosis', aliases: ['Child-Pugh classification cirrhosis', 'hepatic reserve scoring', 'cirrhosis prognosis Child-Pugh', 'MELD Child-Pugh comparison'] },
      ],
      'Viral Hepatitis': [
        { canonical: 'HBV Surface Antigen Serology', aliases: ['hepatitis B serology', 'HBsAg HBeAg anti-HBs', 'hepatitis B window period', 'HBV serological markers', 'anti-HBc IgM HBV'] },
      ],
      'Pancreatitis': [
        { canonical: 'Gallstone vs Alcohol Pancreatitis Etiology', aliases: ['acute pancreatitis causes', 'gallstone pancreatitis mechanism', 'alcohol pancreatitis ethanol', 'acinar cell damage pancreatitis'] },
        { canonical: 'Cullen and Grey Turner Signs', aliases: ['retroperitoneal hemorrhage pancreatitis', 'Cullen sign periumbilical', 'Grey Turner flank ecchymosis', 'hemorrhagic pancreatitis signs'] },
      ],
    },

    Hematology: {
      'Iron Deficiency Anemia': [
        { canonical: 'Microcytic Hypochromic Anemia Pattern', aliases: ['iron deficiency MCV low', 'hypochromic microcytic smear', 'target cells iron deficiency', 'microcytic anemia smear iron'] },
        { canonical: 'Low Ferritin High TIBC Iron Deficiency', aliases: ['iron studies iron deficiency', 'serum iron TIBC ferritin IDA', 'ferritin low iron deficiency', 'transferrin saturation iron deficiency'] },
      ],
      'Megaloblastic Anemia': [
        { canonical: 'B12 Methylmalonyl-CoA Accumulation', aliases: ['vitamin B12 deficiency biochemistry', 'methylmalonic acid B12 deficiency', 'B12 neurologic subacute combined degeneration', 'homocysteine B12 folate'] },
        { canonical: 'Folate Neural Tube Defect Prevention', aliases: ['folate deficiency neural tube defect', 'folic acid pregnancy prevention', 'neural tube defect folate', 'folate supplementation pregnancy'] },
      ],
      'Hemolytic Anemia': [
        { canonical: 'Intravascular vs Extravascular Hemolysis', aliases: ['hemolytic anemia types', 'intravascular hemolysis hemoglobinuria', 'extravascular hemolysis spleen', 'hemolysis location differences'] },
        { canonical: 'Direct vs Indirect Coombs Test', aliases: ['Coombs test hemolytic anemia', 'direct antiglobulin test DAT', 'indirect Coombs antibody screen', 'DAT hemolytic anemia diagnosis'] },
      ],
      'Leukemia': [
        { canonical: 'CML BCR-ABL Philadelphia Chromosome', aliases: ['Philadelphia chromosome CML', 'BCR-ABL fusion CML', 't(9;22) CML', 'imatinib CML target', 'chronic myeloid leukemia 9;22'] },
        { canonical: 'ALL Philadelphia Chromosome Poor Prognosis', aliases: ['ALL t(9;22)', 'Philadelphia chromosome ALL', 'BCR-ABL ALL', 'ALL worse prognosis Philadelphia'] },
      ],
      'Lymphoma': [
        { canonical: 'Reed-Sternberg Cells Hodgkin Lymphoma', aliases: ['Reed-Sternberg cell pathology', 'owl eye Reed-Sternberg', 'Hodgkin lymphoma histology', 'CD15 CD30 Reed-Sternberg'] },
        { canonical: 'B Symptoms Lymphoma', aliases: ['lymphoma B symptoms', 'fever night sweats weight loss lymphoma', 'constitutional symptoms lymphoma', 'Hodgkin B symptoms prognosis'] },
      ],
      'Sickle Cell Disease': [
        { canonical: 'HbS Polymerization Sickling', aliases: ['hemoglobin S polymerization', 'sickle cell deoxygenation sickling', 'HbS pathophysiology', 'sickling deoxygenated states'] },
        { canonical: 'Splenic Autoinfarction', aliases: ['sickle cell autosplenectomy', 'functional asplenia sickle cell', 'splenic infarction sickle cell', 'encapsulated bacteria risk sickle cell'] },
        { canonical: 'Vaso-Occlusive Crisis', aliases: ['sickle cell pain crisis', 'vaso-occlusive episode sickle cell', 'acute chest syndrome sickle cell', 'avascular necrosis sickle cell'] },
      ],
      'Coagulopathy': [
        { canonical: 'DIC Laboratory Findings', aliases: ['disseminated intravascular coagulation labs', 'DIC schistocytes PT PTT', 'DIC low fibrinogen D-dimer', 'microangiopathic hemolytic anemia DIC'] },
        { canonical: 'Hemophilia Factor Deficiency', aliases: ['hemophilia A factor VIII', 'hemophilia B factor IX', 'aPTT prolonged hemophilia', 'X-linked coagulation disorder'] },
      ],
    },

    Multisystem: {
      'Systemic Lupus Erythematosus': [
        { canonical: 'Anti-dsDNA Antibody SLE Specificity', aliases: ['anti-double-stranded DNA SLE', 'anti-dsDNA lupus', 'anti-Smith antibody SLE', 'SLE autoantibodies', 'ANA anti-dsDNA SLE'] },
        { canonical: 'Butterfly Rash and Photosensitivity SLE', aliases: ['malar rash SLE', 'butterfly rash lupus', 'discoid rash SLE', 'photosensitivity lupus'] },
      ],
      'Sarcoidosis': [
        { canonical: 'Noncaseating Granulomas Sarcoidosis', aliases: ['sarcoid granuloma histology', 'noncaseating granuloma sarcoidosis', 'epithelioid granuloma sarcoid', 'granuloma without caseation sarcoidosis'] },
        { canonical: 'Elevated ACE Level Sarcoidosis', aliases: ['serum ACE sarcoidosis', 'angiotensin converting enzyme sarcoidosis', 'ACE level diagnosis sarcoidosis', 'elevated ACE hypercalcemia sarcoidosis'] },
      ],
      'Amyloidosis': [
        { canonical: 'Congo Red Apple-Green Birefringence', aliases: ['amyloidosis Congo red staining', 'apple-green birefringence amyloid', 'polarized light amyloid Congo red', 'amyloid histology staining'] },
      ],
    },

  },

  // ══════════════════════════════════════════════════════════════════════════
  // PHYSIOLOGY
  // ══════════════════════════════════════════════════════════════════════════

  Physiology: {

    Cardiovascular: {
      'Cardiac Action Potential': [
        { canonical: 'Cardiac Action Potential Phases', aliases: ['phase 0-4 cardiac action potential', 'Na influx phase 0 cardiac', 'plateau phase 2 cardiac action potential', 'Ca influx plateau cardiac'] },
        { canonical: 'Pacemaker Cell Automaticity', aliases: ['SA node automaticity', 'funny current pacemaker', 'pacemaker action potential slow response', 'AV node automaticity', 'If channel pacemaker'] },
      ],
      'Frank-Starling Mechanism': [
        { canonical: 'Preload End-Diastolic Volume Relationship', aliases: ['Frank-Starling preload', 'Starling curve EDV', 'end-diastolic volume stroke volume', 'venous return preload'] },
        { canonical: 'Contractility vs Preload Afterload', aliases: ['myocardial contractility inotropy', 'afterload systemic vascular resistance', 'preload vs afterload Starling', 'inotropy contractility heart'] },
      ],
      'Cardiac Output': [
        { canonical: 'Fick Principle Cardiac Output', aliases: ['Fick equation cardiac output', 'oxygen consumption cardiac output', 'Fick principle formula', 'thermodilution cardiac output', 'cardiac output measurement'] },
      ],
      'Blood Pressure Regulation': [
        { canonical: 'Baroreceptor Reflex Arc', aliases: ['baroreceptor reflex mechanism', 'carotid sinus baroreceptor', 'autonomic blood pressure reflex', 'baroreceptor carotid body response'] },
      ],
      'Electrocardiogram': [
        { canonical: 'ECG Interval Interpretation', aliases: ['PR interval AV conduction', 'QRS duration ventricular depolarization', 'QT interval corrected', 'ECG intervals meaning', 'P wave QRS ECG interpretation'] },
      ],
    },

    'Renal / Urinary': {
      'Acid-Base Balance': [
        { canonical: 'Anion Gap Calculation', aliases: ['anion gap formula', 'anion gap metabolic acidosis', 'MUDPILES anion gap', 'high anion gap acidosis', 'normal anion gap acidosis'],
          alsoAllowedIn: [{ subject: 'Pathology', system: 'Endocrine' }, { subject: 'Pathology', system: 'Renal / Urinary' }] },
        { canonical: 'Respiratory Compensation Rules', aliases: ['Winter formula metabolic acidosis', 'compensation acid-base', 'expected compensation acidosis alkalosis', 'acid-base compensation expected'] },
      ],
      'Glomerular Filtration Rate': [
        { canonical: 'GFR Starling Forces', aliases: ['glomerular filtration Starling forces', 'GFR oncotic hydrostatic pressure', 'filtration fraction GFR', 'net filtration pressure glomerulus'] },
        { canonical: 'Creatinine Clearance Renal Function', aliases: ['creatinine clearance GFR estimate', 'renal clearance formula', 'inulin clearance GFR gold standard', 'CrCl estimation'] },
      ],
      'Tubular Transport': [
        { canonical: 'Proximal Tubule Glucose Reabsorption', aliases: ['glucose transport maximum Tm', 'renal threshold glucose', 'proximal tubule cotransport glucose', 'glucosuria threshold', 'SGLT2 proximal tubule normal'] },
      ],
      'Fluid and Electrolytes': [
        { canonical: 'SIADH Hypoosmolar Hyponatremia', aliases: ['syndrome inappropriate ADH', 'SIADH pathophysiology', 'hyponatremia euvolemic SIADH', 'concentrated urine diluted plasma SIADH'] },
        { canonical: 'Hyperaldosteronism Physiology', aliases: ['aldosterone physiology', 'mineralocorticoid effect sodium', 'aldosterone collecting duct sodium', 'ENaC aldosterone activation'] },
      ],
      'Renin-Angiotensin-Aldosterone System': [
        { canonical: 'RAAS Renin Release Triggers', aliases: ['renin release stimuli', 'juxtaglomerular cell renin', 'decreased renal perfusion renin', 'sympathetic beta1 renin release'] },
        { canonical: 'Angiotensin II Effects', aliases: ['angiotensin II vasoconstriction', 'angiotensin II aldosterone release', 'AT1 receptor angiotensin II', 'angiotensin II efferent arteriole'] },
      ],
    },

    Respiratory: {
      'Ventilation-Perfusion Matching': [
        { canonical: 'V/Q Ratio Regional Distribution', aliases: ['V/Q ratio apex vs base', 'lung zone V/Q ratio', 'dead space V/Q infinity', 'shunt V/Q zero', 'V/Q mismatch mechanism'] },
        { canonical: 'Physiologic Dead Space', aliases: ['dead space equation Bohr', 'anatomic vs physiologic dead space', 'dead space ventilation', 'Bohr equation dead space'] },
      ],
      'Respiratory Mechanics': [
        { canonical: 'Lung Compliance Obstructive vs Restrictive', aliases: ['compliance restrictive lung disease', 'FEV1 FVC ratio obstructive vs restrictive', 'spirometry interpretation', 'lung volume obstructive restrictive pattern'] },
        { canonical: 'Surfactant Surface Tension', aliases: ['surfactant surface tension law of Laplace', 'DPPC surfactant', 'neonatal respiratory distress surfactant', 'alveolar surface tension compliance'] },
      ],
      'Oxygen Transport': [
        { canonical: 'Oxygen-Hemoglobin Dissociation Curve Right Shift', aliases: ['Bohr effect', 'right shift O2 Hb curve', 'acid 2,3-BPG right shift', 'decreased O2 affinity right shift', 'temperature hemoglobin curve'] },
        { canonical: '2,3-BPG Hemoglobin Oxygen Affinity', aliases: ['2,3-bisphosphoglycerate hemoglobin', 'DPG hemoglobin affinity', '2,3-BPG altitude adaptation', 'fetal hemoglobin 2,3-BPG'] },
      ],
      'Carbon Dioxide Transport': [
        { canonical: 'Haldane Effect CO2 Transport', aliases: ['Haldane effect deoxygenated hemoglobin CO2', 'carbaminohemoglobin', 'CO2 transport hemoglobin', 'Haldane effect mechanism'] },
      ],
    },

  },

  // ══════════════════════════════════════════════════════════════════════════
  // MICROBIOLOGY
  // ══════════════════════════════════════════════════════════════════════════

  Microbiology: {

    Respiratory: {
      'Streptococcus Pneumoniae': [
        { canonical: 'Pneumococcal Polysaccharide Capsule', aliases: ['S. pneumoniae capsule virulence', 'pneumococcus quellung reaction', 'alpha-hemolytic S pneumoniae capsule', 'pneumococcal vaccine antigen'] },
      ],
      'Tuberculosis': [
        { canonical: 'Ghon Complex Primary TB', aliases: ['primary tuberculosis Ghon complex', 'Ghon focus TB', 'Ranke complex TB', 'primary TB Ghon complex formation'] },
        { canonical: 'IGRA and PPD Testing', aliases: ['tuberculin skin test', 'PPD positive', 'QuantiFERON IGRA', 'latent TB testing', 'TST vs IGRA comparison'] },
      ],
      'Influenza Virus': [
        { canonical: 'Hemagglutinin and Neuraminidase Functions', aliases: ['influenza HA NA', 'hemagglutinin cell attachment', 'neuraminidase viral release', 'oseltamivir neuraminidase inhibition'] },
        { canonical: 'Antigenic Shift vs Antigenic Drift', aliases: ['influenza antigenic variation', 'antigenic shift pandemic', 'antigenic drift seasonal flu', 'reassortment influenza'] },
      ],
      'Pneumocystis Jirovecii Pneumonia': [
        { canonical: 'PCP CD4 Below 200 Threshold', aliases: ['PCP prophylaxis CD4 count', 'Pneumocystis CD4 threshold', 'TMP-SMX PCP prophylaxis', 'HIV PCP CD4 200'] },
      ],
      'Atypical Pneumonia': [
        { canonical: 'Mycoplasma Cold Agglutinins', aliases: ['cold agglutinins Mycoplasma pneumoniae', 'IgM cold agglutinin atypical', 'Mycoplasma walking pneumonia', 'Eaton agent cold agglutinins'] },
        { canonical: 'Legionella Water Source Pontiac', aliases: ['Legionella cooling tower', 'Legionnaire disease water', 'Pontiac fever Legionella', 'intracellular Legionella macrophage'] },
      ],
    },

    Gastrointestinal: {
      'Helicobacter Pylori': [
        { canonical: 'H. pylori Urease CLO Test', aliases: ['H pylori urease breath test', 'CLO test H pylori', 'urea breath test Helicobacter', 'H pylori urease positive'] },
      ],
      'Clostridioides Difficile': [
        { canonical: 'C. diff Toxin A and B Mechanism', aliases: ['C difficile toxin mechanism', 'Clostridium difficile toxin A enterotoxin', 'C diff toxin B cytotoxin', 'pseudomembranous colitis toxin'] },
        { canonical: 'Antibiotic-Associated C. diff Diarrhea', aliases: ['C diff after antibiotics', 'antibiotic disruption C difficile', 'fluoroquinolone C diff risk', 'clindamycin C difficile association'] },
      ],
      'Enteric Pathogens': [
        { canonical: 'Invasive vs Non-Invasive Enteric Pathogens', aliases: ['bloody diarrhea invasive pathogens', 'watery diarrhea non-invasive', 'Shigella invasion', 'Salmonella invasion', 'Vibrio cholerae non-invasive'] },
      ],
      'Viral Gastroenteritis': [
        { canonical: 'Rotavirus Infantile Diarrhea', aliases: ['rotavirus infants', 'rotavirus reovirus family', 'rotavirus watery diarrhea infant', 'rotavirus vaccine'] },
      ],
    },

    'Infectious Disease': {
      'Staphylococcus Aureus': [
        { canonical: 'S. aureus Protein A Virulence', aliases: ['protein A Fc IgG binding', 'staphylococcal protein A virulence', 'S aureus immune evasion protein A', 'staph aureus virulence factors'] },
        { canonical: 'Toxic Shock Syndrome TSST-1', aliases: ['TSST-1 superantigen', 'toxic shock syndrome toxin', 'staphylococcal TSS mechanism', 'superantigen TSST mechanism'] },
      ],
      'Sepsis and Bacteremia': [
        { canonical: 'Gram-Negative LPS Endotoxin Sepsis', aliases: ['lipopolysaccharide sepsis', 'endotoxin gram-negative sepsis', 'LPS TNF sepsis mechanism', 'gram-negative endotoxin shock'] },
      ],
      'Sexually Transmitted Infections': [
        { canonical: 'Gonorrhea Gram-Negative Diplococci', aliases: ['Neisseria gonorrhoeae gram negative intracellular diplococci', 'gonorrhea urethral discharge', 'gonococcal cervicitis', 'Neisseria gonorrhoeae PID'] },
        { canonical: 'Syphilis RPR FTA-ABS Serology', aliases: ['syphilis testing non-treponemal', 'RPR VDRL syphilis', 'FTA-ABS treponemal test', 'syphilis serology screening confirmation'] },
      ],
      'Herpes Virus Infections': [
        { canonical: 'CMV Owl-Eye Inclusions', aliases: ['cytomegalovirus owl eye', 'CMV intranuclear inclusions', 'CMV histology', 'CMV Cowdry type A inclusions'] },
        { canonical: 'EBV Heterophile Antibodies Monospot', aliases: ['Epstein-Barr heterophile antibodies', 'EBV monospot test', 'infectious mononucleosis heterophile', 'EBV positive monospot'] },
      ],
    },

    Multisystem: {
      'HIV and AIDS': [
        { canonical: 'CD4 Count OI Thresholds', aliases: ['HIV CD4 opportunistic infection thresholds', 'CD4 below 200 PCP', 'CD4 below 50 CMV MAC', 'HIV CD4 count AIDS defining'] },
        { canonical: 'HIV Western Blot Confirmation', aliases: ['HIV testing algorithm', 'HIV ELISA Western blot', 'HIV confirmatory test', '4th generation HIV test p24'] },
      ],
      'Disseminated Fungal Infections': [
        { canonical: 'Cryptococcal India Ink Staining', aliases: ['Cryptococcus neoformans India ink', 'cryptococcal meningitis India ink', 'capsule India ink Cryptococcus', 'cryptococcal antigen test'] },
        { canonical: 'Histoplasma Ohio-Mississippi Valley', aliases: ['histoplasmosis epidemiology', 'Histoplasma capsulatum bird bat droppings', 'Ohio river valley histoplasmosis', 'histoplasma macrophage intracellular'] },
      ],
    },

  },

  // ══════════════════════════════════════════════════════════════════════════
  // IMMUNOLOGY
  // ══════════════════════════════════════════════════════════════════════════

  Immunology: {

    Multisystem: {
      'Type I Hypersensitivity': [
        { canonical: 'IgE Mast Cell Degranulation', aliases: ['type I hypersensitivity mechanism', 'IgE FcεRI mast cell', 'anaphylaxis IgE mechanism', 'immediate hypersensitivity degranulation'] },
        { canonical: 'Anaphylaxis Epinephrine Treatment', aliases: ['anaphylaxis treatment', 'epinephrine anaphylaxis alpha beta agonist', 'anaphylaxis management', 'severe allergic reaction epinephrine'] },
      ],
      'Type II Hypersensitivity': [
        { canonical: 'Complement-Mediated Cell Lysis Type II', aliases: ['type II hypersensitivity complement', 'antibody-dependent cytotoxicity', 'IgG IgM cell surface antigen', 'hemolytic transfusion reaction mechanism'] },
      ],
      'Type III Hypersensitivity': [
        { canonical: 'Immune Complex Complement Activation Type III', aliases: ['type III immune complex deposition', 'serum sickness mechanism', 'Arthus reaction type III', 'immune complex vasculitis'] },
      ],
      'Type IV Hypersensitivity': [
        { canonical: 'CD4 Th1 Macrophage Activation Type IV', aliases: ['type IV delayed hypersensitivity', 'T-cell mediated DTH', 'PPD reaction type IV', 'contact dermatitis type IV mechanism'] },
      ],
    },

    Immunology: {
      'Primary Immunodeficiencies': [
        { canonical: 'Bruton Agammaglobulinemia BTK Mutation', aliases: ['XLA BTK mutation', 'Bruton disease agammaglobulinemia', 'Bruton tyrosine kinase XLA', 'agammaglobulinemia X-linked BTK'] },
        { canonical: 'DiGeorge Syndrome Thymic Aplasia', aliases: ['22q11 deletion DiGeorge', 'thymic hypoplasia DiGeorge', 'T-cell deficiency DiGeorge', 'CATCH22 DiGeorge syndrome'] },
        { canonical: 'SCID T and B Cell Absence', aliases: ['severe combined immunodeficiency', 'SCID ADA deficiency', 'SCID IL-2 receptor gamma', 'T-B-NK deficiency SCID'] },
      ],
      'Complement System': [
        { canonical: 'Classical vs Alternative Complement Pathway', aliases: ['complement activation pathways', 'C1q classical pathway', 'properdin alternative pathway', 'mannose-binding lectin complement', 'C3 convertase complement'] },
        { canonical: 'C5-9 Membrane Attack Complex', aliases: ['MAC complement C5-9', 'membrane attack complex lysis', 'terminal complement complex', 'Neisseria complement deficiency C5-9'] },
      ],
    },

  },

  // ══════════════════════════════════════════════════════════════════════════
  // ANATOMY
  // ══════════════════════════════════════════════════════════════════════════

  Anatomy: {

    Neurology: {
      'Brachial Plexus Injuries': [
        { canonical: 'Erb Palsy C5-C6 Root Injury', aliases: ['Erb palsy waiter tip', 'C5 C6 brachial plexus injury', 'upper brachial plexus injury', 'Erb-Duchenne palsy'] },
        { canonical: 'Klumpke Palsy C8-T1 Root Injury', aliases: ['Klumpke paralysis lower brachial plexus', 'C8 T1 brachial plexus injury', 'claw hand Klumpke', 'lower brachial plexus Klumpke'] },
      ],
      'Cranial Nerve Deficits': [
        { canonical: 'CN III Palsy Pupil Dilation Down and Out', aliases: ['oculomotor palsy', 'CN III palsy PCOM aneurysm', 'down and out pupil blown CN III', 'complete CN III palsy', 'posterior communicating aneurysm CN III'] },
        { canonical: 'Bell Palsy CN VII LMN Lesion', aliases: ['facial nerve palsy Bell palsy', 'LMN facial palsy forehead sparing', 'CN VII lower motor neuron', 'Bell palsy complete facial weakness'] },
      ],
      'Spinal Cord Syndromes': [
        { canonical: 'Brown-Sequard Hemisection Pattern', aliases: ['Brown-Sequard syndrome ipsilateral motor', 'cord hemisection findings', 'ipsilateral UMN contralateral pain temperature', 'dorsal column ipsilateral Brown-Sequard'] },
        { canonical: 'ALS Upper and Lower Motor Neuron Signs', aliases: ['amyotrophic lateral sclerosis UMN LMN', 'ALS hyperreflexia fasciculations', 'combined UMN LMN degeneration', 'Charcot disease ALS'] },
      ],
      'Circle of Willis': [
        { canonical: 'MCA Territory Contralateral Hemiplegia', aliases: ['middle cerebral artery stroke deficits', 'MCA infarct hemiplegia aphasia', 'contralateral face arm leg MCA', 'internal capsule MCA territory'] },
        { canonical: 'ACA vs PCA Stroke Deficits', aliases: ['anterior cerebral artery leg weakness', 'posterior cerebral artery visual field defect', 'ACA stroke contralateral leg', 'PCA stroke homonymous hemianopia'] },
      ],
    },

    Musculoskeletal: {
      'Peripheral Nerve Lesions': [
        { canonical: 'Radial Nerve Wrist Drop', aliases: ['radial nerve palsy wrist drop', 'spiral groove radial nerve', 'finger extension loss radial nerve', 'Saturday night palsy radial'] },
        { canonical: 'Ulnar Nerve Claw Hand', aliases: ['ulnar nerve medial epicondyle', 'claw hand 4th 5th digits', 'cubital tunnel ulnar nerve', 'hypothenar wasting ulnar nerve'] },
        { canonical: 'Median Nerve Ape Hand', aliases: ['carpal tunnel median nerve', 'ape hand thenar wasting', 'median nerve thenar atrophy', 'Phalen Tinel median nerve carpal tunnel'] },
      ],
      'Dermatomes and Myotomes': [
        { canonical: 'L4-L5 Foot Drop Nerve Root', aliases: ['foot drop peroneal nerve L4 L5', 'common peroneal nerve foot drop', 'L4 L5 nerve root foot dorsiflexion', 'peroneal nerve fibular neck'] },
      ],
    },

  },

  // ══════════════════════════════════════════════════════════════════════════
  // GENETICS
  // ══════════════════════════════════════════════════════════════════════════

  Genetics: {

    Multisystem: {
      'Autosomal Dominant Disorders': [
        { canonical: 'Autosomal Dominant 50% Offspring Risk', aliases: ['AD inheritance risk', 'dominant inheritance probability', 'one affected allele dominant', '50 percent risk autosomal dominant'] },
        { canonical: 'Variable Expressivity and Penetrance', aliases: ['variable expressivity genetics', 'incomplete penetrance dominant', 'expressivity vs penetrance', 'dominant genetics expressivity'] },
      ],
      'Autosomal Recessive Disorders': [
        { canonical: 'Carrier Heterozygote AR Genetics', aliases: ['AR carrier parents 25% risk', 'autosomal recessive carrier state', 'heterozygous carrier autosomal recessive', 'AR inheritance carriers'] },
        { canonical: 'Heterozygote Advantage Sickle Cell', aliases: ['sickle cell malaria protection', 'heterozygote advantage genetic', 'balanced polymorphism sickle cell', 'carrier advantage AR disorders'] },
      ],
      'X-linked Disorders': [
        { canonical: 'X-linked Recessive Male Predominance', aliases: ['X-linked recessive affected males', 'hemophilia X-linked recessive', 'Duchenne muscular dystrophy X-linked', 'carrier female X-linked'] },
      ],
      'Chromosomal Disorders': [
        { canonical: 'Down Syndrome Trisomy 21 Features', aliases: ['trisomy 21 Down syndrome', 'Down syndrome features clinical', 'trisomy 21 maternal age', 'Down syndrome intellectual disability heart'] },
        { canonical: 'Turner Syndrome 45,X Features', aliases: ['Turner syndrome monosomy X', '45 X Turner', 'Turner syndrome short stature gonadal dysgenesis', 'webbed neck Turner'] },
      ],
    },

  },

  // ══════════════════════════════════════════════════════════════════════════
  // BIOCHEMISTRY
  // ══════════════════════════════════════════════════════════════════════════

  Biochemistry: {

    Multisystem: {
      'Amino Acid Metabolism Disorders': [
        { canonical: 'PKU Phenylalanine Hydroxylase Deficiency', aliases: ['phenylketonuria PAH deficiency', 'phenylalanine hydroxylase PKU', 'PKU tetrahydrobiopterin', 'musty odor PKU infant'] },
        { canonical: 'Homocystinuria Cystathionine Beta-Synthase', aliases: ['homocystinuria CBS deficiency', 'homocysteine accumulation CBS', 'homocystinuria Marfan-like', 'cystathionine beta-synthase homocystinuria'] },
      ],
      'Fatty Acid Metabolism': [
        { canonical: 'Beta-Oxidation Carnitine Shuttle', aliases: ['carnitine fatty acid transport', 'beta oxidation mitochondria', 'MCAD deficiency fasting hypoglycemia', 'carnitine acyltransferase fatty acid'] },
      ],
      'Lysosomal Storage Diseases': [
        { canonical: 'Gaucher Glucocerebrosidase Deficiency', aliases: ['Gaucher disease glucocerebrosidase', 'Gaucher beta-glucocerebrosidase', 'Gaucher Ashkenazi Jewish', 'glucocerebroside accumulation Gaucher'] },
        { canonical: 'Tay-Sachs Hexosaminidase A Deficiency', aliases: ['Tay-Sachs GM2 ganglioside', 'hexosaminidase A Tay-Sachs', 'Tay-Sachs cherry red spot', 'GM2 gangliosidosis Tay-Sachs'] },
      ],
      'Glycolysis and Krebs Cycle': [
        { canonical: 'Pyruvate Dehydrogenase Complex Regulation', aliases: ['PDC pyruvate dehydrogenase', 'pyruvate to acetyl CoA', 'PDH complex thiamine', 'pyruvate dehydrogenase deficiency lactic acidosis'] },
        { canonical: 'TCA Cycle Rate-Limiting Enzymes', aliases: ['Krebs cycle regulation', 'isocitrate dehydrogenase TCA', 'TCA cycle substrate', 'citric acid cycle enzyme regulation'] },
      ],
    },

  },

};

// ── Alias lookup (built once at module load) ──────────────────────────────────
// Maps every normalized concept key → ConceptLookupResult (minus wasAlias — computed at lookup time).

interface ConceptAliasEntry extends ConceptHome {
  readonly canonical: string;
  readonly alsoAllowedIn?: ReadonlyArray<{ subject: MedicaSubject; system: MedicaSystem }>;
}

function buildConceptLookup(): Map<string, ConceptAliasEntry> {
  const map = new Map<string, ConceptAliasEntry>();
  const seenCanonicals = new Set<string>();

  for (const [subject, systemMap] of Object.entries(CONCEPT_TAXONOMY)) {
    for (const [system, topicMap] of Object.entries(systemMap)) {
      for (const [topic, concepts] of Object.entries(topicMap)) {
        for (const entry of concepts) {
          const ck = key(entry.canonical);
          if (seenCanonicals.has(ck)) {
            throw new Error(
              `[medicaConceptTaxonomy] Duplicate canonical "${entry.canonical}" ` +
              `(found again in ${subject} × ${system} × ${topic})`,
            );
          }
          seenCanonicals.add(ck);

          const home: ConceptAliasEntry = {
            canonical: entry.canonical,
            subject: subject as MedicaSubject,
            system: system as MedicaSystem,
            topic,
            alsoAllowedIn: entry.alsoAllowedIn,
          };

          const allKeys = [entry.canonical, ...entry.aliases];
          for (const raw of allKeys) {
            const k = key(raw);
            if (map.has(k)) {
              const existing = map.get(k)!;
              if (existing.canonical !== entry.canonical) {
                throw new Error(
                  `[medicaConceptTaxonomy] Alias collision: key "${k}" (from "${raw}") ` +
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
  }

  return map;
}

// Module-level singleton — any collision throws at import time (caught by tests + startup).
const CONCEPT_LOOKUP: ReadonlyMap<string, ConceptAliasEntry> = buildConceptLookup();

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Look up a raw concept string and return its canonical form with home Subject × System × Topic.
 * Returns null if the concept is not in the taxonomy (unknown — emit WARN, not FAIL).
 *
 * wasAlias=true means the raw input matched an alias, not the canonical key.
 * Callers (conceptValidator) should treat wasAlias=true as WARN, not PASS.
 */
export function lookupConcept(raw: string): ConceptLookupResult | null {
  if (!raw || !raw.trim()) return null;
  const k = key(raw.trim());
  const entry = CONCEPT_LOOKUP.get(k);
  if (!entry) return null;
  return {
    canonical: entry.canonical,
    subject: entry.subject,
    system: entry.system,
    topic: entry.topic,
    wasAlias: k !== key(entry.canonical),
    alsoAllowedIn: entry.alsoAllowedIn,
  };
}

/**
 * Normalize a raw concept string to its canonical form.
 * Returns the canonical string if found, or null if unknown.
 */
export function normalizeConcept(raw: string): string | null {
  return lookupConcept(raw)?.canonical ?? null;
}

/**
 * Alias for normalizeConcept — explicit about canonical resolution.
 */
export const getCanonicalConcept = normalizeConcept;

/**
 * Returns all alias strings for a canonical concept name.
 * Returns an empty array if the canonical is not found.
 */
export function getConceptAliases(canonical: string): readonly string[] {
  if (!canonical) return [];
  const k = key(canonical);

  for (const systemMap of Object.values(CONCEPT_TAXONOMY)) {
    for (const topicMap of Object.values(systemMap)) {
      for (const concepts of Object.values(topicMap)) {
        for (const entry of concepts) {
          if (key(entry.canonical) === k) return entry.aliases;
        }
      }
    }
  }
  return [];
}

/**
 * Returns true if the raw string resolves to a known canonical concept.
 */
export function isValidConcept(raw: string): boolean {
  return lookupConcept(raw) !== null;
}

/**
 * Returns all ConceptEntry records for a given Subject × System × Topic triple.
 * Returns an empty array if the triple is not in the taxonomy.
 */
export function getConceptsForTopic(
  subject: MedicaSubject,
  system: MedicaSystem,
  topic: string,
): readonly ConceptEntry[] {
  const subjectMap = CONCEPT_TAXONOMY[subject] as Record<string, Record<string, readonly ConceptEntry[]>> | undefined;
  if (!subjectMap) return [];
  const systemMap = subjectMap[system] as Record<string, readonly ConceptEntry[]> | undefined;
  if (!systemMap) return [];
  return systemMap[topic] ?? [];
}

/**
 * Returns other concepts in the same topic as the given canonical concept.
 * Useful for adaptive recommendations and flashcard sets.
 */
export function getRelatedConcepts(canonical: string): readonly ConceptEntry[] {
  const result = lookupConcept(canonical);
  if (!result) return [];
  return getConceptsForTopic(result.subject, result.system, result.topic)
    .filter(c => c.canonical !== canonical);
}

/**
 * Returns the total number of canonical concepts in the taxonomy.
 */
export function getTotalConceptCount(): number {
  let count = 0;
  for (const systemMap of Object.values(CONCEPT_TAXONOMY)) {
    for (const topicMap of Object.values(systemMap)) {
      for (const concepts of Object.values(topicMap)) {
        count += concepts.length;
      }
    }
  }
  return count;
}

export function getAllCanonicals(): readonly string[] {
  const result: string[] = [];
  for (const systemMap of Object.values(CONCEPT_TAXONOMY)) {
    for (const topicMap of Object.values(systemMap)) {
      for (const concepts of Object.values(topicMap)) {
        for (const entry of concepts) {
          result.push(entry.canonical);
        }
      }
    }
  }
  return result;
}

/**
 * Groups flashcard-like objects by their normalized canonical concept.
 * Objects with an unknown testedConcept fall into the 'Unknown' bucket.
 * Part 8 readiness helper — does not touch UI or adaptive engine.
 */
export function groupFlashcardsByConcept<T extends { testedConcept?: string }>(
  cards: readonly T[],
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const card of cards) {
    const canonical = normalizeConcept(card.testedConcept ?? '') ?? 'Unknown';
    const bucket = map.get(canonical);
    if (bucket) {
      bucket.push(card);
    } else {
      map.set(canonical, [card]);
    }
  }
  return map;
}

/**
 * Given a mastery score map (conceptCanonical → score 0-1), returns canonical
 * concept names sorted from weakest to strongest.
 * Part 8 readiness helper — does not touch UI or adaptive engine.
 */
export function extractConceptWeaknesses(
  masteryMap: Readonly<Record<string, number>>,
): string[] {
  return Object.entries(masteryMap)
    .sort(([, a], [, b]) => a - b)
    .map(([concept]) => concept);
}

/**
 * Extracts a deduplicated, validated list of canonical concept names from a stored
 * question record (typically from the generated bank body).
 *
 * Reads `canonicalConcepts` from the record; validates each against the taxonomy
 * via `isValidConcept()`. Returns only recognized canonicals, deduplicated.
 * Falls back to normalizing `testedConcept` if `canonicalConcepts` is absent.
 */
export function extractConceptFingerprints(question: Record<string, unknown>): string[] {
  const raw = question['canonicalConcepts'];
  if (Array.isArray(raw) && raw.length > 0) {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const item of raw) {
      const s = typeof item === 'string' ? item.trim() : '';
      if (!s || seen.has(s.toLowerCase())) continue;
      if (!isValidConcept(s)) continue;
      seen.add(s.toLowerCase());
      result.push(s);
    }
    // If all items were invalid, fall through to testedConcept fallback.
    if (result.length > 0) return result;
  }
  // Fallback: attempt to normalize testedConcept
  const tested = typeof question['testedConcept'] === 'string' ? question['testedConcept'].trim() : '';
  if (!tested) return [];
  const canonical = normalizeConcept(tested);
  return canonical ? [canonical] : [];
}
