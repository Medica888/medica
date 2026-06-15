import { defineRule, type MedicalFactRule } from '../medicalFactRuleTypes.js';

export const gastrointestinalFactRules: MedicalFactRule[] = [
  defineRule({
    id: 'hepatology_wilson_atp7b_copper',
    domain: 'Gastrointestinal',
    expected: 'Wilson disease: ATP7B copper excretion defect causing hepatic disease, neurologic signs, and Kayser-Fleischer rings',
    appliesTo: [/\b(wilson\s+disease|atp7b|kayser[-\s]?fleischer|copper\s+excretion|ceruloplasmin)\b/i],
    contradictions: [/\b(hfe|iron\s+overload|alpha[-\s]?1\s+antitrypsin|hepcidin|bilirubin\s+conjugation)\b/i],
    requiredSupport: [/\b(atp7b|copper|kayser|ceruloplasmin|hepatic|neurologic)\b/i],
  }),

  defineRule({
    id: 'hepatology_hemochromatosis_hfe_iron',
    domain: 'Gastrointestinal',
    expected: 'Hereditary hemochromatosis: HFE-related increased intestinal iron absorption causing high ferritin/transferrin saturation, cirrhosis, diabetes, and bronze skin',
    appliesTo: [/\b(hemochromatosis|hfe|bronze\s+diabetes|iron\s+overload|transferrin\s+saturation)\b/i],
    contradictions: [/\b(atp7b|copper|low\s+ferritin|low\s+transferrin\s+saturation|ceruloplasmin)\b/i],
    requiredSupport: [/\b(hfe|iron|ferritin|transferrin\s+saturation|bronze|cirrhosis|diabetes)\b/i],
  }),

  defineRule({
    id: 'gastrointestinal_celiac_ttg_villous_atrophy',
    domain: 'Gastrointestinal',
    expected: 'Celiac disease: gluten-sensitive enteropathy with anti-tTG/anti-endomysial antibodies and small-bowel villous atrophy',
    appliesTo: [/\b(celiac|gluten[-\s]?sensitive|anti[-\s]?ttg|anti[-\s]?endomysial|villous\s+atrophy)\b/i],
    contradictions: [/\b(transmural\s+inflammation|noncaseating\s+granulomas|skip\s+lesions|crohn|crypt\s+abscesses)\b/i],
    requiredSupport: [/\b(gluten|anti[-\s]?ttg|anti[-\s]?endomysial|villous\s+atrophy|dermatitis\s+herpetiformis)\b/i],
  })
];
