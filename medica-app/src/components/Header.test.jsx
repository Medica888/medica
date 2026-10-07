import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import Header from './Header'

describe('Header — Medica logo', () => {
  it('shows the MEDICA wordmark inside the home button', () => {
    render(<Header onHome={() => {}} pageTitle="Dashboard" />)
    const home = screen.getByRole('button', { name: /go to dashboard/i })
    expect(home).toHaveTextContent('MEDICA')
  })

  it('navigates home when the logo is clicked', () => {
    const onHome = vi.fn()
    render(<Header onHome={onHome} pageTitle="Dashboard" />)
    fireEvent.click(screen.getByRole('button', { name: /go to dashboard/i }))
    expect(onHome).toHaveBeenCalledTimes(1)
  })
})
