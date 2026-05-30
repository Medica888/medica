import {
  ResponsiveContainer, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'

/**
 * Reusable timeline area chart for mastery metrics.
 *
 * Props:
 *   data        — array of { sessionNumber, value }
 *   color       — stroke + fill colour
 *   gradientId  — unique id for the SVG gradient (must be unique per chart on page)
 *   unit        — suffix appended in tooltip (e.g. '%')
 *   height      — chart height in px (default 130)
 *   invert      — when true, lower values are "better" (used for concept counts)
 */
export default function MasteryTimelineChart({
  data      = [],
  color     = '#2E64C8',
  gradientId = 'mtc-default',
  unit      = '',
  height    = 130,
  invert    = false,
}) {
  if (!data || data.length < 2) {
    return (
      <div className="mtc-empty" style={{ height }}>
        <span>Complete more sessions to see this trend.</span>
      </div>
    )
  }

  const values  = data.map(d => d.value)
  const dataMin = Math.min(...values)
  const dataMax = Math.max(...values)
  // Add 10% padding above and below, min domain 0
  const domainMin = Math.max(0, Math.floor(dataMin * 0.9))
  const domainMax = Math.ceil(dataMax * 1.1) || 10

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={color} stopOpacity={0.22} />
            <stop offset="95%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-s)" vertical={false} />
        <XAxis
          dataKey="sessionNumber"
          tick={{ fontSize: 9, fill: 'var(--t4)' }}
          axisLine={false}
          tickLine={false}
          tickFormatter={v => `S${v}`}
        />
        <YAxis
          domain={[domainMin, domainMax]}
          tick={{ fontSize: 9, fill: 'var(--t4)' }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          contentStyle={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            fontSize: 11,
          }}
          labelFormatter={v => `Session ${v}`}
          formatter={v => [`${v}${unit}`, invert ? 'count' : 'score']}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={2}
          fill={`url(#${gradientId})`}
          dot={{ r: 3, fill: color, strokeWidth: 0 }}
          activeDot={{ r: 5, fill: color, strokeWidth: 0 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
