/**
 * Shared date-range helpers used by both analyticsEngine and storage.
 * Kept separate to avoid circular imports (analyticsEngine → storage → analyticsEngine).
 */

/**
 * Returns the inclusive start Date for the given range, or null for 'all'.
 * @param {'week'|'month'|'all'} range
 * @param {Date} [now]
 * @returns {Date|null}
 */
export function getRangeStartDate(range, now = new Date()) {
  if (range === 'week') {
    const d = new Date(now.getTime())
    d.setDate(d.getDate() - 7)
    return d
  }
  if (range === 'month') {
    const d = new Date(now.getTime())
    d.setDate(d.getDate() - 30)
    return d
  }
  return null // 'all' — no filtering
}

/**
 * Returns true if the ISO timestamp falls on or after startDate.
 * Missing or unparseable timestamps return false (excluded from week/month ranges).
 * @param {string|null|undefined} isoTimestamp
 * @param {Date|null} startDate
 * @returns {boolean}
 */
export function isTimestampInRange(isoTimestamp, startDate) {
  if (!startDate) return true  // 'all' — always in range
  if (!isoTimestamp) return false
  const d = new Date(isoTimestamp)
  return !isNaN(d.getTime()) && d >= startDate
}
