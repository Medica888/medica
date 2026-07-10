import { useEffect, useState } from 'react'
import { questionReports } from '../lib/apiClient'
import { useAuth } from '../context/AuthContext.jsx'

// Shared across every QuestionReportControl instance mounted at once (e.g. a 40-question
// exam review renders every card's report control simultaneously) so they issue a single
// eligibility fetch instead of one each.
let inFlight = null // { userId, promise }

function fetchEligibility(userId) {
  if (inFlight?.userId === userId) return inFlight.promise
  const promise = questionReports.getEligibility().catch(() => null)
  inFlight = { userId, promise }
  return promise
}

/**
 * Server-provided reporter eligibility: { eligible, reason, eligibleAt } | null.
 * null means anonymous, not yet loaded, or the request failed — callers should treat
 * that as "unknown" and fall back to a generic message, not as "ineligible".
 */
export function useReporterEligibility() {
  const { authUser } = useAuth()
  const userId = authUser?.id ?? null
  const [eligibility, setEligibility] = useState(null)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!userId) { setEligibility(null); return }
    let cancelled = false
    fetchEligibility(userId).then((result) => {
      if (!cancelled) setEligibility(result)
    })
    return () => { cancelled = true }
  }, [userId])

  return eligibility
}
