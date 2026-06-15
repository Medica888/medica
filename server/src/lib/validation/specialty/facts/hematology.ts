import { defineRule, type MedicalFactRule } from '../medicalFactRuleTypes.js';

export const hematologyFactRules: MedicalFactRule[] = [
  defineRule({
    id: 'hematology_sickle_cell_beta_globin',
    domain: 'Hematology',
    expected: 'Sickle cell disease: beta-globin missense mutation causing HbS polymerization, vaso-occlusion, and hemolytic anemia',
    appliesTo: [/\b(sickle\s+cell|hbs\b|beta[-\s]?globin|vaso[-\s]?occlusive|autosplenectomy)\b/i],
    contradictions: [/\b(alpha[-\s]?globin\s+deletion|spectrin\s+defect|g6pd\s+deficiency|iron\s+deficiency|b12\s+deficiency)\b/i],
    requiredSupport: [/\b(beta[-\s]?globin|hbs|sickling)\b/i],
  }),

  defineRule({
    id: 'hematology_g6pd_oxidative_hemolysis',
    domain: 'Hematology',
    expected: 'G6PD deficiency: impaired NADPH generation causing oxidative hemolysis with bite cells and Heinz bodies after triggers',
    appliesTo: [/\b(g6pd|glucose[-\s]?6[-\s]?phosphate\s+dehydrogenase|heinz\s+bodies|bite\s+cells|oxidative\s+hemolysis)\b/i],
    contradictions: [/\b(spectrin\s+defect|hereditary\s+spherocytosis|iron\s+deficiency|b12\s+deficiency|beta[-\s]?globin\s+polymerization)\b/i],
    requiredSupport: [/\b(nadph|oxidative|heinz|bite\s+cells|g6pd|glutathione)\b/i],
  }),

  {
    id:       'heme_001',
    domain:   'Hematology',
    expected: 'Philadelphia chromosome t(9;22): creates BCR-ABL fusion gene; characteristic of CML; also found in poor-prognosis B-ALL; treated with imatinib (TKI)',
    appliesTo: [
      /\b(philadelphia\s+chr|t\s*\(\s*9\s*;\s*22\)|bcr.abl)\b/i,
    ],
    contradictions: [
      /philadelphia.{0,40}(cll|all.{0,10}good\s+prognosis|aml\b(?!\s+with))/i,
      /bcr.abl.{0,40}t\s*\(\s*(8|14|15|17)\s*;\s*(14|17|21|22)\s*\)/i,
    ],
    requiredSupport: [/philadelphia.{0,40}(cml|bcr.abl)/i],
    source:         'First Aid 2025 p.415; Harrison\'s 21e Ch.84',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'heme_002',
    domain:   'Hematology',
    expected: 'Sickle cell disease: β-globin gene mutation (Glu→Val at position 6) — NOT α-globin; HbS tetramer (α2βS2)',
    appliesTo: [
      /\b(sickle\s+cell|hbs)\b.{0,60}(globin|mutation|gene|glu|val)/i,
    ],
    contradictions: [
      /sickle\s+cell.{0,40}alpha.{0,10}(globin|chain).{0,20}mutation/i,
      /hbs.{0,30}alpha.{0,10}globin/i,
    ],
    requiredSupport: [/sickle.{0,40}beta.{0,10}globin/i],
    source:         'First Aid 2025 p.406; Harrison\'s 21e Ch.94',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'heme_003',
    domain:   'Hematology',
    expected: 'von Willebrand disease: MOST COMMON inherited bleeding disorder (not hemophilia A); increased bleeding time; normal or increased aPTT',
    appliesTo: [
      /\b(most\s+common.{0,20}inherited\s+bleeding|von\s+willebrand)\b/i,
    ],
    contradictions: [
      /hemophilia\s+a\b.{0,30}most\s+common\s+inherited\s+bleeding/i,
      /hemophilia.{0,20}most\s+common\s+hereditary\s+bleeding/i,
    ],
    requiredSupport: [/von\s+willebrand.{0,40}most\s+common\s+inherited/i],
    source:         'First Aid 2025 p.417; Harrison\'s 21e Ch.104',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'heme_004',
    domain:   'Hematology',
    expected: 'Hemophilia A: Factor VIII deficiency; X-linked recessive; increased aPTT, NORMAL PT; hemarthroses in males',
    appliesTo: [
      /\bhemophilia\s+a\b.{0,60}(factor|pt|aptt|ptt)/i,
    ],
    contradictions: [
      /hemophilia\s+a.{0,40}(elevat|prolonged|increased)\s+(pt|inr)\b/i,
      /hemophilia\s+a.{0,40}factor\s+(ix|9|vii|7|x|10)/i,
    ],
    requiredSupport: [/hemophilia\s+a.{0,40}factor\s+(viii|8)/i],
    source:         'First Aid 2025 p.417',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'heme_005',
    domain:   'Hematology',
    expected: 'TTP: ADAMTS13 deficiency; pentad (MAHA, thrombocytopenia, fever, renal failure, neuro symptoms); treat with PLASMAPHERESIS — NOT platelet transfusion (contraindicated)',
    appliesTo: [
      /\b(ttp|thrombotic\s+thrombocytopenic\s+purpura)\b.{0,60}(treat|management|plasma)/i,
    ],
    contradictions: [
      /ttp.{0,40}platelet\s+transfusion\b.{0,20}(treat|manage|first.line)/i,
    ],
    requiredSupport: [/ttp.{0,40}(plasmapheresis|plasma\s+exchange)/i],
    source:         'First Aid 2025 p.418; Harrison\'s 21e Ch.103',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'heme_006',
    domain:   'Hematology',
    expected: 'HIT (heparin-induced thrombocytopenia): antibodies against heparin-PF4 complex; causes THROMBOSIS (not just bleeding); treat with ARGATROBAN or bivalirudin — NOT warfarin as initial monotherapy',
    appliesTo: [
      /\bhit\b.{0,40}(heparin|thrombocytopenia|pf4|treat)/i,
      /heparin.induced\s+thrombocytopenia.{0,40}treat/i,
    ],
    contradictions: [
      /hit.{0,40}warfarin\b.{0,20}(first.line|initial\s+treatment|immediately)/i,
      /hit.{0,40}continue\s+heparin/i,
    ],
    requiredSupport: [/hit.{0,40}(argatroban|bivalirudin|direct\s+thrombin\s+inhibitor)/i],
    source:         'First Aid 2025 p.418; ASH HIT Guidelines 2018',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'heme_009',
    domain:   'Hematology',
    expected: 'G6PD deficiency: X-linked recessive; oxidative stress (primaquine, dapsone, fava beans, infections) → Heinz bodies + bite cells; hemolytic anemia',
    appliesTo: [
      /\bg6pd\b.{0,60}(heinz|bite\s+cell|hemolytic|oxidative)/i,
    ],
    contradictions: [
      /g6pd.{0,40}autosomal\s+(dominant|recessive)/i,
      /g6pd.{0,40}target\s+cell/i,
    ],
    requiredSupport: [/g6pd.{0,40}x.linked/i],
    source:         'First Aid 2025 p.406; Harrison\'s 21e Ch.94',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'heme_010',
    domain:   'Hematology',
    expected: 'APL (AML-M3): t(15;17) → PML-RARα fusion; treat with ATRA (all-trans retinoic acid) which causes differentiation; high risk of DIC',
    appliesTo: [
      /\b(apl\b|acute\s+promyelocytic|aml.?m3)\b/i,
    ],
    contradictions: [
      /apl.{0,40}(imatinib|gleevec).{0,20}(treat|first.line)/i,
      /apl.{0,40}t\s*\(\s*9\s*;\s*22\)/i,
    ],
    requiredSupport: [/apl.{0,40}(atra|t\s*\(\s*15\s*;\s*17\)|pml.rar)/i],
    source:         'First Aid 2025 p.415; Harrison\'s 21e Ch.84',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  }
];
