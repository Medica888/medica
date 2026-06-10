/**
 * Medica USMLE Subject × System Matrix
 *
 * Canonical validity table for all 11 Subject × 15 System combinations (165 pairs)
 * derived from First Aid Step 1 2025, UWorld Step 1 distribution, and NBME content specs.
 *
 * Three tiers:
 *   allowedPairs  — Core USMLE combinations. Heavily tested; high confidence.
 *   warningPairs  — Technically valid but low-yield or uncommon on Step 1.
 *                   Pass with a reduced score cap (non-blocking warn).
 *   invalidPairs  — Cannot produce a valid USMLE Step 1 clinical vignette.
 *                   Blocked; question must be re-tagged before it can be approved.
 *
 * Every pair [subject, system] is classified exactly once. All 165 pairs are covered.
 */

import type { MedicaSubject, MedicaSystem } from './medicaTaxonomy.js';

export type SubjectSystemStatus = 'allowed' | 'warning' | 'invalid';

// ── Core USMLE subject×system combinations ────────────────────────────────────
// Basis: FA 2025 organ-system chapters + UWorld/NBME high-yield topic distributions.
// Pairs present in multiple question banks with sufficient question volume.

export const allowedPairs: ReadonlyArray<readonly [MedicaSubject, MedicaSystem]> = [
  // ── ANATOMY ──────────────────────────────────────────────────────────────────
  // FA: Cardiovascular, Respiratory, GI, Renal, Musculoskeletal, Neurology, Reproductive
  // chapters all open with anatomy/embryology sections. All core.
  ['Anatomy', 'Cardiovascular'],
  ['Anatomy', 'Respiratory'],
  ['Anatomy', 'Renal / Urinary'],
  ['Anatomy', 'Gastrointestinal'],
  ['Anatomy', 'Neurology'],       // neuroanatomy: brachial plexus, spinal tracts, cranial nerves — very high yield
  ['Anatomy', 'Musculoskeletal'], // nerve lesions, compartments, bone anatomy — very high yield
  ['Anatomy', 'Reproductive'],    // pelvic anatomy, embryologic structures, Mullerian/Wolffian
  ['Anatomy', 'Endocrine'],       // adrenal gland, pituitary, thyroid anatomy
  ['Anatomy', 'Dermatology'],     // skin layer anatomy (epidermis, dermis)
  ['Anatomy', 'Hematology'],      // bone marrow architecture, lymph node anatomy
  ['Anatomy', 'Multisystem'],     // embryology general, connective tissue anatomy

  // ── PHYSIOLOGY ───────────────────────────────────────────────────────────────
  // Every organ-system chapter in FA has a dedicated physiology section.
  ['Physiology', 'Cardiovascular'],
  ['Physiology', 'Respiratory'],
  ['Physiology', 'Renal / Urinary'],   // acid-base, GFR, tubular physiology — very high yield
  ['Physiology', 'Gastrointestinal'],
  ['Physiology', 'Endocrine'],         // HPA axis, thyroid feedback, glucose regulation
  ['Physiology', 'Neurology'],         // neurotransmitters, membrane potential, reflexes
  ['Physiology', 'Reproductive'],      // menstrual cycle, pregnancy physiology, FSH/LH
  ['Physiology', 'Hematology'],        // coagulation cascade, RBC physiology, hemostasis
  ['Physiology', 'Musculoskeletal'],   // muscle contraction, exercise physiology
  ['Physiology', 'Immunology'],        // innate/adaptive immune physiology, cytokines
  ['Physiology', 'Multisystem'],       // cell physiology, membrane transport, homeostasis

  // ── PATHOLOGY ────────────────────────────────────────────────────────────────
  // Pathology spans all organ systems in FA + Pathoma. All specific systems are core.
  ['Pathology', 'Cardiovascular'],
  ['Pathology', 'Respiratory'],
  ['Pathology', 'Renal / Urinary'],
  ['Pathology', 'Gastrointestinal'],
  ['Pathology', 'Endocrine'],
  ['Pathology', 'Neurology'],          // neurodegenerative, demyelinating, stroke pathology
  ['Pathology', 'Hematology'],         // leukemia, anemia, hemolytic disorders
  ['Pathology', 'Musculoskeletal'],    // bone tumors, OA/RA, myopathies
  ['Pathology', 'Reproductive'],       // OB pathology, ovarian/testicular tumors
  ['Pathology', 'Dermatology'],        // skin cancer, inflammatory skin disease
  ['Pathology', 'Oncology'],           // tumor pathology, oncogenes, carcinogenesis
  ['Pathology', 'Immunology'],         // autoimmune pathology, hypersensitivity
  ['Pathology', 'Infectious Disease'], // disease manifestations of infection (tissue pathology)
  ['Pathology', 'Multisystem'],        // systemic diseases: SLE, amyloidosis, sarcoidosis

  // ── PHARMACOLOGY ─────────────────────────────────────────────────────────────
  // Drug questions exist for every organ system on Step 1 and UWorld.
  // Pharmacology is the ONLY subject with no invalid pairings.
  ['Pharmacology', 'Cardiovascular'],    // beta-blockers, ACE inhibitors, statins
  ['Pharmacology', 'Respiratory'],       // bronchodilators, corticosteroids, antileukotrienes
  ['Pharmacology', 'Renal / Urinary'],   // diuretics, RAAS drugs
  ['Pharmacology', 'Gastrointestinal'],  // PPIs, antiemetics, laxatives, GI motility drugs
  ['Pharmacology', 'Endocrine'],         // insulin, thyroid drugs, glucocorticoids, metformin
  ['Pharmacology', 'Neurology'],         // antiepileptics, anesthetics, dopaminergics, migraine
  ['Pharmacology', 'Psychiatry'],        // antidepressants, antipsychotics, anxiolytics, lithium
  ['Pharmacology', 'Oncology'],          // chemotherapy mechanisms — very high yield
  ['Pharmacology', 'Infectious Disease'],// antibiotics, antivirals, antifungals, antiparasitics
  ['Pharmacology', 'Hematology'],        // anticoagulants, antiplatelets, iron/B12/folate
  ['Pharmacology', 'Musculoskeletal'],   // NSAIDs, DMARDs, gout drugs, muscle relaxants
  ['Pharmacology', 'Reproductive'],      // hormonal contraceptives, fertility drugs, tocolytics
  ['Pharmacology', 'Immunology'],        // immunosuppressants, biologics (mAbs)
  ['Pharmacology', 'Dermatology'],       // retinoids, topical steroids, antifungals
  ['Pharmacology', 'Multisystem'],       // general pharmacokinetics, toxicology, drug interactions

  // ── BIOCHEMISTRY ─────────────────────────────────────────────────────────────
  // Biochemistry is primarily general principles (Multisystem).
  // Specific systems where biochemical pathways drive the clinical question are included.
  ['Biochemistry', 'Multisystem'],     // metabolism, enzyme kinetics, DNA replication/repair
  ['Biochemistry', 'Endocrine'],       // glucose/lipid/steroid metabolism, DKA biochemistry
  ['Biochemistry', 'Hematology'],      // heme synthesis (porphyrias), G6PD, hemoglobin structure
  ['Biochemistry', 'Renal / Urinary'], // tubular transport molecules, purine metabolism (urate)
  ['Biochemistry', 'Gastrointestinal'],// digestive enzyme biochemistry, bile acid metabolism
  ['Biochemistry', 'Neurology'],       // lysosomal storage diseases (Tay-Sachs, Niemann-Pick), NTx synthesis

  // ── GENETICS ─────────────────────────────────────────────────────────────────
  // Genetics questions focus on hereditary patterns and specific disease-gene associations.
  ['Genetics', 'Multisystem'],    // inheritance patterns, chromosomal disorders, imprinting
  ['Genetics', 'Hematology'],     // sickle cell, thalassemia, G6PD — all defined by mutations
  ['Genetics', 'Reproductive'],   // trisomies, sex chromosome disorders, teratology
  ['Genetics', 'Oncology'],       // tumor suppressor genes, proto-oncogenes, Li-Fraumeni
  ['Genetics', 'Neurology'],      // Huntington, fragile X, muscular dystrophies, NF1/NF2
  ['Genetics', 'Respiratory'],    // CF (CFTR) — one of highest-yield genetics topics in Step 1

  // ── MICROBIOLOGY ─────────────────────────────────────────────────────────────
  // Microbiology organizes by organism type but is tested by organ-system manifestation.
  ['Microbiology', 'Respiratory'],      // S. pneumoniae, TB, influenza, atypicals, PCP
  ['Microbiology', 'Gastrointestinal'], // Salmonella, Shigella, C. diff, H. pylori, E. coli
  ['Microbiology', 'Neurology'],        // meningitis, encephalitis, brain abscess, prion
  ['Microbiology', 'Renal / Urinary'],  // pyelonephritis, UTI pathogens, renal TB
  ['Microbiology', 'Infectious Disease'],// general ID principles: sepsis, bacteremia, fungemia
  ['Microbiology', 'Reproductive'],     // STIs: gonorrhea, chlamydia, syphilis, HSV, HPV
  ['Microbiology', 'Dermatology'],      // tinea, impetigo, cellulitis, MRSA, Lyme rash
  ['Microbiology', 'Cardiovascular'],   // endocarditis (viridans Strep, S. aureus), myocarditis
  ['Microbiology', 'Musculoskeletal'],  // osteomyelitis, septic arthritis, Lyme arthritis
  ['Microbiology', 'Hematology'],       // EBV (mono), CMV, hemolytic anemias from micro
  ['Microbiology', 'Multisystem'],      // HIV, disseminated TB, systemic fungal infections

  // ── IMMUNOLOGY (subject) ─────────────────────────────────────────────────────
  // Immunology discipline tested in contexts where immune mechanisms drive the disease.
  ['Immunology', 'Multisystem'],      // hypersensitivity types, transplant rejection, complement
  ['Immunology', 'Renal / Urinary'], // immune complex GN, anti-GBM, IgA nephropathy
  ['Immunology', 'Respiratory'],     // hypersensitivity pneumonitis, asthma (IgE), ABPA
  ['Immunology', 'Hematology'],      // autoimmune hemolytic anemia, ITP, HIT
  ['Immunology', 'Neurology'],       // MS (autoimmune demyelination), myasthenia gravis
  ['Immunology', 'Gastrointestinal'],// IBD (Crohn/UC immune mechanisms), celiac (anti-tTG)
  ['Immunology', 'Musculoskeletal'], // RA (anti-CCP), SLE (anti-dsDNA), ankylosing spondylitis
  ['Immunology', 'Endocrine'],       // DM type 1 (anti-islet), Hashimoto's, Graves'
  ['Immunology', 'Immunology'],      // primary immunodeficiencies: SCID, DiGeorge, CGD, XLA

  // ── BEHAVIORAL SCIENCE ───────────────────────────────────────────────────────
  // Behavioral science in Step 1 is almost entirely within psychiatry or general principles.
  ['Behavioral Science', 'Psychiatry'], // biopsychosocial model, defense mechanisms, grief stages

  // ── BIOSTATISTICS ────────────────────────────────────────────────────────────
  // Biostatistics is discipline-only; never organ-system-specific.
  ['Biostatistics', 'Multisystem'],

  // ── ETHICS ───────────────────────────────────────────────────────────────────
  // Ethics (informed consent, autonomy, etc.) is never organ-system-specific.
  ['Ethics', 'Multisystem'],
];

// ── Low-yield / uncommon combinations ────────────────────────────────────────
// Technically valid USMLE content but below core frequency threshold.
// Returned as non-blocking warn (score capped at 60).

export const warningPairs: ReadonlyArray<readonly [MedicaSubject, MedicaSystem]> = [
  // ANATOMY — less common standalone anatomy questions
  ['Anatomy', 'Immunology'],        // thymus/spleen/lymph node architecture
  ['Anatomy', 'Psychiatry'],        // limbic system, prefrontal anatomy — thin as standalone
  ['Anatomy', 'Oncology'],          // tumor anatomic localization — usually Pathology
  ['Anatomy', 'Infectious Disease'],// anatomic ports of entry — thin as standalone

  // PHYSIOLOGY — uncommon physiology pairings
  ['Physiology', 'Psychiatry'],        // neurobiology of psychiatric symptoms — thin
  ['Physiology', 'Dermatology'],       // skin barrier physiology — rarely standalone
  ['Physiology', 'Oncology'],          // cell cycle physiology — usually Biochemistry/Pathology
  ['Physiology', 'Infectious Disease'],// host defense physiology — usually Immunology

  // PATHOLOGY — uncommon pathology pairings
  ['Pathology', 'Psychiatry'], // psychiatric neuropathology — thin on Step 1

  // BIOCHEMISTRY — organ-specific biochemistry that is tested but infrequently
  ['Biochemistry', 'Cardiovascular'], // lipoprotein biochemistry, familial hypercholesterolemia
  ['Biochemistry', 'Musculoskeletal'],// glycogen storage diseases (McArdle, Pompe)
  ['Biochemistry', 'Respiratory'],    // surfactant biochemistry (DPPC), alpha-1 antitrypsin
  ['Biochemistry', 'Reproductive'],   // steroid hormone synthesis pathways
  ['Biochemistry', 'Oncology'],       // oncogene biochemistry, DNA repair defects
  ['Biochemistry', 'Infectious Disease'],// not well-represented; thin
  ['Biochemistry', 'Psychiatry'],     // monoamine synthesis (dopamine, serotonin pathways)
  ['Biochemistry', 'Immunology'],     // complement biochemistry, MHC structure
  ['Biochemistry', 'Dermatology'],    // porphyria cutanea tarda, albinism (melanin synthesis)

  // GENETICS — less common gene-disease pairings by system
  ['Genetics', 'Endocrine'],       // MEN1/MEN2 (RET, MEN1 gene), McCune-Albright
  ['Genetics', 'Renal / Urinary'], // PKD1/PKD2, Alport syndrome (collagen IV)
  ['Genetics', 'Musculoskeletal'], // Marfan (FBN1), OI (collagen I), DMD (dystrophin)
  ['Genetics', 'Cardiovascular'],  // LQTS (KCNQ1/KCNH2), HCM (MYH7), Marfan aortic
  ['Genetics', 'Gastrointestinal'],// FAP (APC), Lynch syndrome (MMR genes), Wilson (ATP7B)
  ['Genetics', 'Dermatology'],     // NF1/NF2 skin findings, xeroderma pigmentosum, albinism
  ['Genetics', 'Immunology'],      // primary immunodeficiencies: XLA (BTK), SCID (ADA/IL2RG)
  ['Genetics', 'Infectious Disease'],// CCR5-Δ32 HIV resistance, pharmacogenomics of antiretrovirals
  ['Genetics', 'Psychiatry'],      // fragile X (social/behavioral aspects), Rett syndrome

  // MICROBIOLOGY — uncommon system-organism pairings
  ['Microbiology', 'Endocrine'],  // adrenal TB, Waterhouse-Friderichsen (meningococcemia)
  ['Microbiology', 'Oncology'],   // oncogenic viruses: EBV→lymphoma, HPV→cervical, HBV→HCC
  ['Microbiology', 'Immunology'], // immune evasion mechanisms, vaccine immunology

  // IMMUNOLOGY (subject) — less common immunology pairings
  ['Immunology', 'Cardiovascular'], // cardiac transplant rejection, vasculitis (ANCA, anti-GBM)
  ['Immunology', 'Dermatology'],    // pemphigus vulgaris, psoriasis immune mechanisms
  ['Immunology', 'Oncology'],       // cancer immunology, immune checkpoint biology
  ['Immunology', 'Reproductive'],   // Rh incompatibility, immune-mediated infertility
  ['Immunology', 'Infectious Disease'],// IRIS, immune reconstitution in HIV, innate immune response

  // BEHAVIORAL SCIENCE — borderline valid system pairings
  ['Behavioral Science', 'Neurology'],    // neurobiology of anxiety/depression
  ['Behavioral Science', 'Reproductive'], // postpartum depression, sexual dysfunction, infertility grief
  ['Behavioral Science', 'Multisystem'],  // biopsychosocial model, chronic illness adaptation
];

// ── Invalid combinations ──────────────────────────────────────────────────────
// These cannot produce a valid USMLE Step 1 clinical vignette.
// Blocked (fail, blocking: true) — the question must be re-tagged.

export const invalidPairs: ReadonlyArray<readonly [MedicaSubject, MedicaSystem]> = [
  // MICROBIOLOGY — cannot be psychiatric
  ['Microbiology', 'Psychiatry'], // CNS infections → Microbiology + Neurology; not Psychiatry

  // IMMUNOLOGY (subject) — Psychiatry: no immune-based psychiatric Step 1 content
  ['Immunology', 'Psychiatry'],

  // BEHAVIORAL SCIENCE — cannot be organ-system-specific (it's discipline-only like Biostatistics)
  ['Behavioral Science', 'Cardiovascular'],
  ['Behavioral Science', 'Respiratory'],
  ['Behavioral Science', 'Renal / Urinary'],
  ['Behavioral Science', 'Gastrointestinal'],
  ['Behavioral Science', 'Endocrine'],
  ['Behavioral Science', 'Musculoskeletal'],
  ['Behavioral Science', 'Dermatology'],
  ['Behavioral Science', 'Hematology'],
  ['Behavioral Science', 'Oncology'],
  ['Behavioral Science', 'Immunology'],
  ['Behavioral Science', 'Infectious Disease'],

  // BIOSTATISTICS — always general principles, never organ-specific
  ['Biostatistics', 'Cardiovascular'],
  ['Biostatistics', 'Respiratory'],
  ['Biostatistics', 'Renal / Urinary'],
  ['Biostatistics', 'Gastrointestinal'],
  ['Biostatistics', 'Endocrine'],
  ['Biostatistics', 'Reproductive'],
  ['Biostatistics', 'Neurology'],
  ['Biostatistics', 'Psychiatry'],
  ['Biostatistics', 'Musculoskeletal'],
  ['Biostatistics', 'Dermatology'],
  ['Biostatistics', 'Hematology'],
  ['Biostatistics', 'Oncology'],
  ['Biostatistics', 'Immunology'],
  ['Biostatistics', 'Infectious Disease'],

  // ETHICS — always general principles, never organ-specific
  ['Ethics', 'Cardiovascular'],
  ['Ethics', 'Respiratory'],
  ['Ethics', 'Renal / Urinary'],
  ['Ethics', 'Gastrointestinal'],
  ['Ethics', 'Endocrine'],
  ['Ethics', 'Reproductive'],
  ['Ethics', 'Neurology'],
  ['Ethics', 'Psychiatry'],
  ['Ethics', 'Musculoskeletal'],
  ['Ethics', 'Dermatology'],
  ['Ethics', 'Hematology'],
  ['Ethics', 'Oncology'],
  ['Ethics', 'Immunology'],
  ['Ethics', 'Infectious Disease'],
];

// ── Lookup ────────────────────────────────────────────────────────────────────

function pairKey(subject: string, system: string): string {
  return `${subject}|${system}`;
}

const _allowedSet = new Set(allowedPairs.map(([s, sys]) => pairKey(s, sys)));
const _warningSet = new Set(warningPairs.map(([s, sys]) => pairKey(s, sys)));
const _invalidSet = new Set(invalidPairs.map(([s, sys]) => pairKey(s, sys)));

/**
 * Returns the USMLE validity status for a subject+system pair.
 * 'unknown' is only returned when both values are non-null but not in the matrix —
 * this should not occur for valid MedicaSubject × MedicaSystem combinations.
 */
export function getPairStatus(
  subject: MedicaSubject | null,
  system: MedicaSystem | null,
): SubjectSystemStatus | 'unknown' {
  if (!subject || !system) return 'unknown';
  const k = pairKey(subject, system);
  if (_invalidSet.has(k)) return 'invalid';
  if (_warningSet.has(k)) return 'warning';
  if (_allowedSet.has(k)) return 'allowed';
  return 'unknown';
}
