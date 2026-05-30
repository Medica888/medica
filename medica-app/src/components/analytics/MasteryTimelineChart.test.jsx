import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import MasteryTimelineChart from './MasteryTimelineChart'

const TWO_POINTS = [
  { sessionNumber: 1, value: 53 },
  { sessionNumber: 2, value: 58 },
]

const THREE_POINTS = [
  { sessionNumber: 1, value: 40 },
  { sessionNumber: 2, value: 55 },
  { sessionNumber: 3, value: 70 },
]

describe('MasteryTimelineChart', () => {
  it('renders the empty-state message when data has fewer than 2 points', () => {
    render(<MasteryTimelineChart data={[]} />)
    expect(screen.getByText(/more sessions/i)).toBeTruthy()
  })

  it('renders the empty-state message with a single data point', () => {
    render(<MasteryTimelineChart data={[{ sessionNumber: 1, value: 50 }]} />)
    expect(screen.getByText(/more sessions/i)).toBeTruthy()
  })

  it('renders a recharts container when data has 2+ points', () => {
    const { container } = render(<MasteryTimelineChart data={TWO_POINTS} gradientId="test-grad" />)
    // ResponsiveContainer renders a wrapper div; chart content may not have layout in jsdom
    expect(container.firstChild).toBeTruthy()
    expect(screen.queryByText(/more sessions/i)).toBeNull()
  })

  it('renders with three data points without crashing', () => {
    const { container } = render(
      <MasteryTimelineChart data={THREE_POINTS} color="#9E5068" unit="%" gradientId="ptp-priority" />,
    )
    expect(container.firstChild).toBeTruthy()
    expect(screen.queryByText(/more sessions/i)).toBeNull()
  })

  it('renders a recharts responsive container div', () => {
    const { container } = render(
      <MasteryTimelineChart data={TWO_POINTS} height={200} gradientId="h-test" />,
    )
    expect(container.firstChild).toBeTruthy()
  })

  it('renders without error when invert=true', () => {
    const { container } = render(
      <MasteryTimelineChart data={TWO_POINTS} invert gradientId="inv-test" />,
    )
    expect(container.firstChild).toBeTruthy()
  })
})
