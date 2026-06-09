type TaxonomyLabel =
  | 'Anatomy'
  | 'Physiology'
  | 'Pathology'
  | 'Pharmacology'
  | 'Biochemistry'
  | 'Genetics'
  | 'Microbiology'
  | 'Immunology'
  | 'Behavioral Science'
  | 'Biostatistics'
  | 'Ethics'
  | 'Cardiovascular'
  | 'Respiratory'
  | 'Renal / Urinary'
  | 'Gastrointestinal'
  | 'Endocrine'
  | 'Reproductive'
  | 'Neurology'
  | 'Psychiatry'
  | 'Musculoskeletal'
  | 'Dermatology'
  | 'Hematology'
  | 'Oncology'
  | 'Infectious Disease'
  | 'Multisystem'
  | 'Balanced'
  | 'More Easy'
  | 'More Hard'
  | 'NBME Difficult'
  | 'UWorld Challenge';

export const allowedSubjects = [
  'Anatomy',
  'Physiology',
  'Pathology',
  'Pharmacology',
  'Biochemistry',
  'Genetics',
  'Microbiology',
  'Immunology',
  'Behavioral Science',
  'Biostatistics',
  'Ethics',
] as const;

export const allowedSystems = [
  'Cardiovascular',
  'Respiratory',
  'Renal / Urinary',
  'Gastrointestinal',
  'Endocrine',
  'Reproductive',
  'Neurology',
  'Psychiatry',
  'Musculoskeletal',
  'Dermatology',
  'Hematology',
  'Oncology',
  'Immunology',
  'Infectious Disease',
  'Multisystem',
] as const;

export const allowedDifficulties = [
  'Balanced',
  'More Easy',
  'More Hard',
  'NBME Difficult',
  'UWorld Challenge',
] as const;

export type MedicaSubject = typeof allowedSubjects[number];
export type MedicaSystem = typeof allowedSystems[number];
export type MedicaDifficulty = typeof allowedDifficulties[number];

export const subjectAliases: Record<string, MedicaSubject> = {
  'Behavioral Health': 'Behavioral Science',
  'Behavioral Sciences': 'Behavioral Science',
  Psychology: 'Behavioral Science',
  Epidemiology: 'Biostatistics',
  'Population Health': 'Biostatistics',
  Professionalism: 'Ethics',
  Pathophysiology: 'Pathology',
  'Disease Mechanism': 'Pathology',
  Pharm: 'Pharmacology',
  Biochem: 'Biochemistry',
  Micro: 'Microbiology',
  Immuno: 'Immunology',
  'Biostatistics Epidemiology Population Health': 'Biostatistics',
};

export const systemAliases: Record<string, MedicaSystem> = {
  Cardio: 'Cardiovascular',
  Cardiology: 'Cardiovascular',
  Cardiac: 'Cardiovascular',
  Heart: 'Cardiovascular',
  Vascular: 'Cardiovascular',
  'Cardiovascular System': 'Cardiovascular',

  Pulmonary: 'Respiratory',
  Lung: 'Respiratory',
  'Respiratory System': 'Respiratory',

  Renal: 'Renal / Urinary',
  Kidney: 'Renal / Urinary',
  Nephrology: 'Renal / Urinary',
  Urinary: 'Renal / Urinary',
  'Renal Urinary': 'Renal / Urinary',
  'Renal Urinary System': 'Renal / Urinary',
  'Renal and Urinary System': 'Renal / Urinary',
  'Renal & Urinary System': 'Renal / Urinary',

  GI: 'Gastrointestinal',
  Digestive: 'Gastrointestinal',
  'Gastrointestinal System': 'Gastrointestinal',

  Endocrinology: 'Endocrine',
  'Endocrine System': 'Endocrine',

  OB: 'Reproductive',
  Obstetrics: 'Reproductive',
  Gynecology: 'Reproductive',
  'Reproductive System': 'Reproductive',

  Neuro: 'Neurology',
  'Nervous System': 'Neurology',
  Neuroscience: 'Neurology',
  Neurological: 'Neurology',
  'Nervous System and Special Senses': 'Neurology',
  'Nervous System & Special Senses': 'Neurology',
  'Nervous System Special Senses': 'Neurology',

  Psych: 'Psychiatry',
  Psychology: 'Psychiatry',
  'Behavioral Health': 'Psychiatry',
  'Mental Health': 'Psychiatry',

  MSK: 'Musculoskeletal',
  'Musculoskeletal System': 'Musculoskeletal',

  Derm: 'Dermatology',
  Skin: 'Dermatology',
  'Skin and Subcutaneous Tissue': 'Dermatology',
  'Skin & Subcutaneous Tissue': 'Dermatology',
  'Skin Subcutaneous Tissue': 'Dermatology',

  Heme: 'Hematology',
  Blood: 'Hematology',
  'Blood and Lymphoreticular': 'Hematology',
  'Blood & Lymphoreticular System': 'Hematology',
  'Blood Lymphoreticular': 'Hematology',
  'Blood Lymphoreticular System': 'Hematology',
  Lymph: 'Hematology',

  Cancer: 'Oncology',
  Neoplasia: 'Oncology',

  Immune: 'Immunology',
  'Immune System': 'Immunology',

  ID: 'Infectious Disease',
  Infection: 'Infectious Disease',
  Infectious: 'Infectious Disease',
  'Infectious Diseases': 'Infectious Disease',

  General: 'Multisystem',
  Mixed: 'Multisystem',
  'General Principles': 'Multisystem',
  'Multisystem Processes': 'Multisystem',
  'Multisystem Processes and Disorders': 'Multisystem',
  'Human Development': 'Multisystem',
  Development: 'Multisystem',
};

export const difficultyAliases: Record<string, MedicaDifficulty> = {
  Easy: 'More Easy',
  Easier: 'More Easy',
  Foundation: 'More Easy',
  Hard: 'More Hard',
  Harder: 'More Hard',
  Difficult: 'More Hard',
  NBME: 'NBME Difficult',
  'NBME Hard': 'NBME Difficult',
  UWorld: 'UWorld Challenge',
  'UWorld Difficult': 'UWorld Challenge',
  Challenge: 'UWorld Challenge',
};

const broadValues = new Set([
  '',
  'all',
  'all subjects',
  'all systems',
  'all topics',
  'any',
  'any subject',
  'any system',
  'any topic',
  'general',
  'mixed',
  'select subject',
  'select system',
  'select topic',
]);

function key(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildLookup<T extends TaxonomyLabel>(
  canonical: readonly T[],
  aliases: Record<string, T>,
): Map<string, T> {
  const map = new Map<string, T>();
  for (const label of canonical) map.set(key(label), label);
  for (const [alias, label] of Object.entries(aliases)) map.set(key(alias), label);
  return map;
}

const subjectLookup = buildLookup(allowedSubjects, subjectAliases);
const systemLookup = buildLookup(allowedSystems, systemAliases);
const difficultyLookup = buildLookup(allowedDifficulties, difficultyAliases);

export function isBroadTaxonomyValue(value: unknown): boolean {
  return broadValues.has(key(value));
}

export function normalizeSubject(value: unknown): MedicaSubject | null {
  return subjectLookup.get(key(value)) ?? null;
}

export function normalizeSystem(value: unknown): MedicaSystem | null {
  return systemLookup.get(key(value)) ?? null;
}

export function normalizeDifficulty(value: unknown): MedicaDifficulty | null {
  return difficultyLookup.get(key(value)) ?? null;
}

export function isKnownSubject(value: unknown): boolean {
  return normalizeSubject(value) !== null;
}

export function isKnownSystem(value: unknown): boolean {
  return normalizeSystem(value) !== null;
}

export function isKnownDifficulty(value: unknown): boolean {
  return normalizeDifficulty(value) !== null;
}

export function subjectSearchLabels(value: unknown): string[] {
  const normalized = normalizeSubject(value);
  if (!normalized) return [];
  return [normalized, ...Object.entries(subjectAliases)
    .filter(([, label]) => label === normalized)
    .map(([alias]) => alias)];
}

export function systemSearchLabels(value: unknown): string[] {
  const normalized = normalizeSystem(value);
  if (!normalized) return [];
  return [normalized, ...Object.entries(systemAliases)
    .filter(([, label]) => label === normalized)
    .map(([alias]) => alias)];
}

export function difficultySearchLabels(value: unknown): string[] {
  const normalized = normalizeDifficulty(value);
  if (!normalized) return [];
  return [normalized, ...Object.entries(difficultyAliases)
    .filter(([, label]) => label === normalized)
    .map(([alias]) => alias)];
}
