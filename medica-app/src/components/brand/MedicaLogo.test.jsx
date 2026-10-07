import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import MedicaLogo from './MedicaLogo'

describe('MedicaLogo', () => {
  it('renders the wordmark and tagline when given', () => {
    render(<MedicaLogo tagline="Step 1 Mastery" />)
    expect(screen.getByText('MEDICA')).toBeInTheDocument()
    expect(screen.getByText('Step 1 Mastery')).toBeInTheDocument()
  })

  it('omits the tagline by default', () => {
    const { container } = render(<MedicaLogo />)
    expect(container.querySelector('.medica-logo-tagline')).toBeNull()
  })

  it('renders only the shield when wordmark is off', () => {
    render(<MedicaLogo wordmark={false} />)
    expect(screen.queryByText('MEDICA')).not.toBeInTheDocument()
  })

  it('gives each instance its own gradient id', () => {
    const { container } = render(<><MedicaLogo /><MedicaLogo /></>)
    const ids = [...container.querySelectorAll('linearGradient')].map(el => el.id)
    expect(new Set(ids).size).toBe(2)
  })
})
