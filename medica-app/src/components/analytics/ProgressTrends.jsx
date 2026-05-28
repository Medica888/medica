import {
  ResponsiveContainer, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'

// Hardcoded because CSS variables don't resolve as SVG presentation attributes
const COLOR_SCORE = '#1769C8'
const COLOR_ACC   = '#0FAD6F'
const COLOR_GRID  = '#D4E3F0'
const COLOR_TICK  = '#A8BFD4'

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="an-trend-tooltip">
      <div className="an-trend-tt-title">Session {label}</div>
      {payload.map((p, i) => (
        <div key={i} className="an-trend-tt-row">
          <span className="an-trend-tt-dot" style={{ background: p.color }} />
          <span className="an-trend-tt-lbl">{p.name}</span>
          <span className="an-trend-tt-val">{p.value}</span>
        </div>
      ))}
    </div>
  )
}

export default function ProgressTrends({ trends }) {
  return (
    <div className="an-card an-trends-card">
      <div className="an-card-title">Score History</div>
      <div className="an-trends-chart-wrap">
        <ResponsiveContainer width="100%" height={200}>
          <LineChart
            data={trends}
            margin={{ top: 8, right: 12, left: -12, bottom: 0 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke={COLOR_GRID}
              vertical={false}
            />
            <XAxis
              dataKey="index"
              tick={{ fontSize: 11, fill: COLOR_TICK }}
              axisLine={false}
              tickLine={false}
              label={{ value: 'Session', position: 'insideBottom', offset: -2, fontSize: 11, fill: COLOR_TICK }}
            />
            <YAxis
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
              tick={{ fontSize: 11, fill: COLOR_TICK }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: COLOR_GRID, strokeWidth: 1 }} />
            <Legend
              verticalAlign="top"
              align="right"
              iconType="circle"
              iconSize={7}
              wrapperStyle={{ fontSize: 12, paddingBottom: 6 }}
            />
            <Line
              type="monotone"
              dataKey="medicaScore"
              name="Medica Score"
              stroke={COLOR_SCORE}
              strokeWidth={2}
              dot={{ r: 4, fill: COLOR_SCORE, strokeWidth: 0 }}
              activeDot={{ r: 6, fill: COLOR_SCORE, strokeWidth: 0 }}
            />
            <Line
              type="monotone"
              dataKey="accuracy"
              name="Accuracy"
              stroke={COLOR_ACC}
              strokeWidth={2}
              dot={{ r: 4, fill: COLOR_ACC, strokeWidth: 0 }}
              activeDot={{ r: 6, fill: COLOR_ACC, strokeWidth: 0 }}
              strokeDasharray="5 3"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
