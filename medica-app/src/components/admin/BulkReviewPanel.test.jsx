import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import BulkReviewPanel from './BulkReviewPanel'

const setup = (props = {}) => {
  const onSubmit = vi.fn()
  const onCancel = vi.fn()
  render(<BulkReviewPanel selectedCount={3} hardCount={0} pending={false} onSubmit={onSubmit} onCancel={onCancel} {...props} />)
  return { onSubmit, onCancel }
}

const submitButton = () => screen.getByRole('button', { name: /mark \d+ reviewed/i })
const fillSources = (text = 'First Aid 2025 p.100') =>
  fireEvent.change(screen.getByLabelText(/source references/i), { target: { value: text } })
const attest = () => fireEvent.click(screen.getByRole('checkbox'))

describe('BulkReviewPanel', () => {
  it('cannot submit without a source reference', () => {
    setup()
    attest()
    expect(submitButton()).toBeDisabled()
  })

  it('cannot submit without the attestation', () => {
    setup()
    fillSources()
    expect(submitButton()).toBeDisabled()
  })

  it('submits parsed sources, status, and notes once sourced and attested', () => {
    const { onSubmit } = setup()
    fillSources('First Aid 2025 p.100\n  Robbins 10e ch.5  \n\n')
    fireEvent.change(screen.getByLabelText(/notes/i), { target: { value: ' spot checked ' } })
    attest()
    fireEvent.click(submitButton())
    expect(onSubmit).toHaveBeenCalledWith({
      reviewStatus: 'source_checked',
      sourceRefs: ['First Aid 2025 p.100', 'Robbins 10e ch.5'],
      reviewNotes: 'spot checked',
    })
  })

  it('blocks Source checked when hard-mode questions are selected, and allows Expert reviewed', () => {
    const { onSubmit } = setup({ hardCount: 2 })
    fillSources()
    attest()
    expect(screen.getByRole('alert')).toHaveTextContent('2 selected questions are NBME Difficult or UWorld Challenge')
    expect(submitButton()).toBeDisabled()

    fireEvent.change(screen.getByLabelText(/review status/i), { target: { value: 'expert_reviewed' } })
    expect(screen.queryByRole('alert')).toBeNull()
    fireEvent.click(submitButton())
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ reviewStatus: 'expert_reviewed' }))
  })

  it('disables submit while a request is pending and calls onCancel', () => {
    const { onCancel } = setup({ pending: true })
    fillSources()
    attest()
    expect(submitButton()).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalled()
  })
})
