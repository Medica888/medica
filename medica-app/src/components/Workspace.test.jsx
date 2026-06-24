import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Workspace from './Workspace.jsx'
import { useAuthState } from '../hooks/useAuthState.js'
import { generate } from '../lib/apiClient.js'

vi.mock('../hooks/useAuthState.js', () => ({
  useAuthState: vi.fn(),
}))

vi.mock('../lib/apiClient.js', () => ({
  generate: { skillStream: vi.fn() },
}))

const skill = {
  id: 'medical-writer',
  name: 'Medical Writer',
  description: 'Generate a medical explanation',
  category: 'Education',
  emoji: 'M',
  mode: 'text',
  template: 'Describe the concept',
}

describe('Workspace authenticated AI generation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuthState.mockReturnValue({ isAuthenticated: false })
  })

  it('labels the guide and blocks anonymous paid generation', () => {
    render(<Workspace skill={skill} onBack={() => {}} />)

    expect(screen.getByLabelText('Content generation guide')).toBeTruthy()
    expect(screen.getByText('Sign in from Settings to use live AI generation.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Generate' })).toBeDisabled()
    expect(generate.skillStream).not.toHaveBeenCalled()
  })

  it('shows a clear capacity error from the central streaming client', async () => {
    useAuthState.mockReturnValue({ isAuthenticated: true })
    generate.skillStream.mockRejectedValue(
      Object.assign(new Error('Too many requests'), { status: 429, code: 'RATE_LIMITED' }),
    )
    render(<Workspace skill={skill} onBack={() => {}} />)

    fireEvent.change(screen.getByLabelText('Content generation guide'), {
      target: { value: 'Explain ventricular preload' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Generate' }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('temporarily at capacity')
    })
  })
})
