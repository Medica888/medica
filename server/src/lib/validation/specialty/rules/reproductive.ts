import { normalizeSubject, normalizeSystem } from '../../../medicaTaxonomy.js';
import type { ValidationQuestion, ValidatorResult } from '../../validationTypes.js';
import { answerSupport, fail, has, intentTextFor, warn } from '../specialtyRuleHelpers.js';

export function validateReproductive(question: ValidationQuestion): ValidatorResult | null {
  const system = normalizeSystem(question.system);
  const haystack = intentTextFor(question).toLowerCase();
  const support = answerSupport(question).toLowerCase();

  const isRepro = system === 'Reproductive' || has(haystack, /\b(reproductive|pregnan|ovary|ovarian|testis|testicular|prostate|endometriosis|pcos|placenta|hcg)\b/i);
  if (!isRepro) return null;

  if (has(haystack, /\b(pcos|polycystic\s+ovarian|hyperandrogenism|oligo[-\s]?ovulation|lh:?\s*fsh)\b/i)) {
    if (has(support, /\b(low\s+androgens|decreased\s+lh|primary\s+ovarian\s+failure|low\s+insulin|hypogonadotropic)\b/i) && !has(support, /\b(hyperandrogen|increased\s+lh|insulin\s+resistance|oligo|anovulation)\b/i)) {
      return fail('PCOS: hyperandrogenism with chronic anovulation, insulin resistance, and often increased LH:FSH ratio', support, 'reproductive_pcos_contradiction');
    }
  }

  if (has(haystack, /\b(endometriosis|chocolate\s+cyst|cyclic\s+pelvic\s+pain|dyspareunia|ectopic\s+endometrial)\b/i)) {
    if (has(support, /\b(endometrial\s+carcinoma|leiomyoma|adenomyosis\s+only|noncyclic|germ\s+cell\s+tumor)\b/i) && !has(support, /\b(ectopic\s+endometrial|cyclic|chocolate|endometriosis|pelvic)\b/i)) {
      return fail('Endometriosis: ectopic endometrial glands/stroma causing cyclic pelvic pain and chocolate cysts', support, 'reproductive_endometriosis_contradiction');
    }
  }

  if (has(haystack, /\b(benign\s+prostatic\s+hyperplasia|bph|nodular\s+hyperplasia|periurethral|dihydrotestosterone|dht)\b/i)) {
    if (has(support, /\b(testosterone\s+only|peripheral\s+zone|prostate\s+cancer|estrogen\s+deficiency|psa\s+always\s+normal)\b/i) && !has(support, /\b(dht|dihydrotestosterone|5[-\s]?alpha|periurethral|transition\s+zone|nodular)\b/i)) {
      return fail('BPH: DHT-driven nodular hyperplasia in periurethral/transition zone', support, 'reproductive_bph_contradiction');
    }
  }

  if (has(haystack, /\b(ectopic\s+pregnancy|adnexal|tubal\s+pregnancy|no\s+intrauterine\s+pregnancy|beta[-\s]?hcg)\b/i)) {
    if (has(support, /\b(intrauterine\s+pregnancy\s+confirmed|normal\s+pregnancy|molar\s+pregnancy|ovarian\s+torsion\s+only)\b/i) && !has(support, /\b(adnexal|tubal|no\s+intrauterine|hcg)\b/i)) {
      return fail('Ectopic pregnancy: positive beta-hCG with no intrauterine pregnancy and possible adnexal mass/pain', support, 'reproductive_ectopic_pregnancy_contradiction');
    }
  }

  if (has(haystack, /\b(preeclampsia|eclampsia|hypertension\s+after\s+20\s+weeks|proteinuria|seizure\s+pregnancy)\b/i)) {
    if (has(support, /\b(before\s+20\s+weeks|no\s+hypertension|no\s+proteinuria|gestational\s+diabetes|placenta\s+previa)\b/i) && !has(support, /\b(after\s+20\s+weeks|hypertension\s+and\s+proteinuria|eclampsia|seizure)\b/i)) {
      return fail('Preeclampsia: new hypertension after 20 weeks with proteinuria or end-organ dysfunction; eclampsia adds seizures', support, 'reproductive_preeclampsia_contradiction');
    }
  }

  return null;
}
