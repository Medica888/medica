import { defineRule, type MedicalFactRule } from '../medicalFactRuleTypes.js';

export const neurologyFactRules: MedicalFactRule[] = [
  defineRule({
    id: 'neurology_parkinson_dopamine_loss',
    domain: 'Neurology',
    expected: 'Parkinson disease: loss of dopaminergic neurons in substantia nigra pars compacta with Lewy bodies',
    appliesTo: [/\b(parkinson|resting\s+tremor|bradykinesia|substantia\s+nigra|lewy\s+bodies)\b/i],
    contradictions: [/\b(huntingtin|caudate\s+atrophy|amyloid\s+plaques|upper\s+motor\s+neuron\s+only|dopamine\s+excess)\b/i],
    requiredSupport: [/\b(dopaminergic|substantia\s+nigra|lewy|bradykinesia|resting\s+tremor)\b/i],
  }),

  defineRule({
    id: 'neurology_huntington_cag_caudate',
    domain: 'Neurology',
    expected: 'Huntington disease: autosomal dominant CAG repeat expansion with caudate atrophy and chorea',
    appliesTo: [/\b(huntington|cag\s+repeat|caudate\s+atrophy|chorea)\b/i],
    contradictions: [/\b(dopaminergic\s+neuron\s+loss|lewy\s+bodies|amyloid\s+plaques|cgg\s+repeat|fmr1)\b/i],
    requiredSupport: [/\b(cag|caudate|chorea|autosomal\s+dominant)\b/i],
  }),

  defineRule({
    id: 'neurology_alzheimer_amyloid_tau',
    domain: 'Neurology',
    expected: 'Alzheimer disease: beta-amyloid plaques and hyperphosphorylated tau neurofibrillary tangles causing progressive dementia',
    appliesTo: [/\b(alzheimer|amyloid\s+plaques|neurofibrillary\s+tangles|tau|progressive\s+dementia)\b/i],
    contradictions: [/\b(caudate\s+atrophy|huntingtin|lewy\s+bodies|substantia\s+nigra|prion\s+protein|frontotemporal\s+only)\b/i],
    requiredSupport: [/\b(beta[-\s]?amyloid|amyloid\s+plaques|tau|neurofibrillary\s+tangles|progressive\s+dementia)\b/i],
  }),

  defineRule({
    id: 'neurology_multiple_sclerosis_demyelination',
    domain: 'Neurology',
    expected: 'Multiple sclerosis: autoimmune CNS demyelination with lesions separated in time and space and oligoclonal IgG bands',
    appliesTo: [/\b(multiple\s+sclerosis|oligoclonal\s+bands|internuclear\s+ophthalmoplegia|cns\s+demyelination)\b/i],
    contradictions: [/\b(peripheral\s+demyelination|schwann\s+cells|anterior\s+horn\s+cells|dopaminergic\s+loss|amyloid\s+plaques)\b/i],
    requiredSupport: [/\b(cns|oligoclonal|demyelination|time\s+and\s+space|optic\s+neuritis)\b/i],
  }),

  defineRule({
    id: 'neurology_myasthenia_ach_receptor',
    domain: 'Neurology',
    expected: 'Myasthenia gravis: antibodies against postsynaptic acetylcholine receptors cause fatigable weakness that improves with rest',
    appliesTo: [/\b(myasthenia\s+gravis|fatigable\s+weakness|ptosis|acetylcholine\s+receptor|thymoma)\b/i],
    contradictions: [/\b(presynaptic\s+calcium\s+channel|p\/q[-\s]?type\s+calcium|lambert[-\s]?eaton|improves\s+with\s+repeated\s+use)\b/i],
    requiredSupport: [/\b(acetylcholine\s+receptor|postsynaptic|fatigable|ptosis|thymoma|improves\s+with\s+rest)\b/i],
  }),

  {
    id:       'neuro_001',
    domain:   'Neurology',
    expected: 'Alzheimer disease: cholinergic deficit (ACh); amyloid plaques + neurofibrillary tangles (tau); NOT a dopamine or serotonin deficiency',
    appliesTo: [
      /\balzheimer\b.{0,60}(neurotransmitter|cholinergic|dopamine|deficit)/i,
    ],
    contradictions: [
      /alzheimer.{0,40}dopamine\s+(deficien|decreas|loss)/i,
      /alzheimer.{0,40}serotonin\s+(deficien|decreas|loss)/i,
    ],
    requiredSupport: [/alzheimer.{0,40}(acetylcholine|cholinergic|ach\b)/i],
    source:         'First Aid 2025 p.519; Harrison\'s 21e Ch.423',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'neuro_002',
    domain:   'Neurology',
    expected: 'Lambert-Eaton syndrome: IMPROVES with repetitive stimulation (pre-synaptic Ca channel defect → more Ca released with repeat); myasthenia gravis WORSENS with repetition',
    appliesTo: [
      /\b(lambert.eaton|lems?)\b/i,
    ],
    contradictions: [
      /lambert.eaton.{0,40}(wors|decreas|fatiguabl).{0,30}(repet|use)/i,
      /lambert.eaton.{0,40}post.synaptic/i,
      /lambert.eaton.{0,40}anti.achr/i,
    ],
    requiredSupport: [/lambert.eaton.{0,40}(improve|increas|facilitat).{0,30}(repet|stimulat|use)/i],
    source:         'First Aid 2025 p.527; Harrison\'s 21e Ch.442',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'neuro_003',
    domain:   'Neurology',
    expected: 'Bell palsy (CN VII LMN): CANNOT wrinkle forehead ipsilaterally — entire ipsilateral face paralyzed; UMN lesion spares forehead (bilateral cortical representation)',
    appliesTo: [
      /\b(bell.s?\s*palsy|cn\s*vii\s+lmn|facial\s+nerve\s+palsy)\b/i,
    ],
    contradictions: [
      /bell.s?\s*palsy.{0,40}forehead\s+(spar|intact|preserv)/i,
      /bell.s?\s*palsy.{0,40}upper\s+face.{0,20}spar/i,
    ],
    source:         'First Aid 2025 p.508',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'neuro_004',
    domain:   'Neurology',
    expected: 'Lateral medullary (Wallenberg) syndrome (PICA infarct): IPSILATERAL face sensory loss + CONTRALATERAL body sensory loss — crossed findings',
    appliesTo: [
      /\b(wallenberg|lateral\s+medullary|pica\s+infarct|pica\s+stroke)\b/i,
    ],
    contradictions: [
      /wallenberg.{0,60}(ipsilateral|same\s+side).{0,30}body\s+(loss|deficit|numb)/i,
      /wallenberg.{0,60}contralateral.{0,30}face\s+(loss|deficit|numb)/i,
    ],
    source:         'First Aid 2025 p.508; Harrison\'s 21e Ch.420',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'neuro_005',
    domain:   'Neurology',
    expected: 'Huntington disease: CAG trinucleotide repeat on CHROMOSOME 4; caudate nucleus atrophy; autosomal dominant; anticipation (paternal especially)',
    appliesTo: [
      /\bhuntington\b.{0,60}(chromosome|chr|cag|repeat)/i,
    ],
    contradictions: [
      /huntington.{0,40}(chr|chromosome)\s*(1[^4]|[0-35-9]|1[45678]|2\d|4[^$])\b/i,
      /huntington.{0,40}cag.{0,20}(chr|chromosome)\s*(1|9|17|19|22|x)/i,
    ],
    requiredSupport: [/huntington.{0,40}(chr|chromosome)\s*4/i],
    source:         'First Aid 2025 p.519',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'neuro_006',
    domain:   'Neurology',
    expected: 'Guillain-Barré syndrome (GBS): albuminocytologic dissociation — HIGH protein + NORMAL cell count in CSF; ascending demyelinating; associated with Campylobacter jejuni',
    appliesTo: [
      /\b(guillain.barr|gbs|acute\s+inflammatory\s+demyelinat.{0,20}polyneuropath)/i,
    ],
    contradictions: [
      /guillain.barr.{0,40}(high|elevated).{0,20}(wbc|cell\s+count|pleocytosis).{0,20}csf/i,
      /gbs.{0,40}(high|elevated).{0,20}cell\s+count.{0,20}csf/i,
    ],
    requiredSupport: [/guillain.barr.{0,40}(high|elevated).{0,20}protein.{0,20}(normal|low).{0,20}cell/i],
    source:         'First Aid 2025 p.530; Harrison\'s 21e Ch.439',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'neuro_007',
    domain:   'Neurology',
    expected: 'Multiple sclerosis: periventricular WHITE MATTER (not gray matter) demyelinating plaques; oligoclonal IgG bands in CSF; internuclear ophthalmoplegia from MLF lesion',
    appliesTo: [
      /\bmultiple\s+sclerosis\b.{0,60}(plaque|lesion|white\s+matter|periventricular)/i,
    ],
    contradictions: [
      /multiple\s+sclerosis.{0,40}gray\s+matter.{0,20}plaque/i,
      /ms.{0,30}axon\s+(destruct|loss)\b.{0,20}primary/i,
    ],
    source:         'First Aid 2025 p.524; Harrison\'s 21e Ch.436',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  }
];
