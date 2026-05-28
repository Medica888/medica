function deriveInsight(repeatedPatterns, repeatedMistakes, primaryFailureMode) {
  const hasRepeatedMistakes = (repeatedMistakes?.length ?? 0) >= 3
  const hasConceptPattern   = repeatedPatterns?.some(p => p.type === 'concept'  && p.count >= 2)
  const hasCategoryPattern  = repeatedPatterns?.some(p => p.type === 'category' && p.count >= 2)
  const failureType         = primaryFailureMode?.type

  if (!repeatedPatterns?.length && !repeatedMistakes?.length) {
    return {
      signal: 'insufficient',
      headline: 'Pattern detection requires more data.',
      detail: 'Complete additional sessions across varied subjects to surface clinical reasoning patterns.',
    }
  }

  if (hasRepeatedMistakes && failureType === 'retention') {
    return {
      signal: 'retention',
      headline: 'Repeated misses suggest unstable retention across related concepts.',
      detail: 'The same questions are being missed across sessions — indicating a retrieval gap rather than a learning gap. Spaced review addresses this directly.',
    }
  }

  if (hasConceptPattern) {
    return {
      signal: 'mechanism',
      headline: 'Errors concentrate in repeated mechanisms rather than isolated misses.',
      detail: 'Multiple questions testing the same underlying concept are being missed. Deep concept-level review is more effective than broad re-reading.',
    }
  }

  if (hasCategoryPattern) {
    return {
      signal: 'category',
      headline: 'Error clusters map to a specific clinical category.',
      detail: 'A defined subject or system accounts for a disproportionate share of errors. Concentrated drilling in that area will have the highest return.',
    }
  }

  return {
    signal: 'distributed',
    headline: 'No dominant reasoning pattern detected.',
    detail: 'Errors are distributed across distinct concepts. Continued broad practice builds the integrated reasoning foundation required for complex vignettes.',
  }
}

export default function ClinicalReasoningPattern({ repeatedPatterns, repeatedMistakes, mistakeDiagnosis, studyPrescription }) {
  const primaryFailureMode = mistakeDiagnosis?.primaryFailureMode
  const insight = deriveInsight(repeatedPatterns, repeatedMistakes, primaryFailureMode)
  const topStudy = studyPrescription?.[0]

  return (
    <div className="an-card an-crp-card">
      <div className="an-card-title">Clinical Reasoning Pattern</div>
      <div className="an-crp-signal">
        <span className={`an-crp-badge an-crp-badge--${insight.signal}`}>
          {insight.signal === 'insufficient' ? 'Low Data' : insight.signal.replace('-', ' ')}
        </span>
      </div>
      <div className="an-crp-headline">{insight.headline}</div>
      <p className="an-crp-detail">{insight.detail}</p>
      {primaryFailureMode && primaryFailureMode.type !== 'low-exposure' && (
        <div className="an-crp-row">
          <span className="an-crp-row-lbl">Failure mode</span>
          <span className="an-crp-row-val">{primaryFailureMode.label}</span>
        </div>
      )}
      {topStudy && (
        <div className="an-crp-row">
          <span className="an-crp-row-lbl">Highest priority</span>
          <span className="an-crp-row-val">{topStudy.topic}</span>
        </div>
      )}
    </div>
  )
}
