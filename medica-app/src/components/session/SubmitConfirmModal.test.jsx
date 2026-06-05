import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import SubmitConfirmModal from './SubmitConfirmModal'

function renderModal(props = {}) {
  const defaults = {
    isOpen: true,
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
    answered: 4,
    total: 5,
    markedCount: 1,
  }
  return render(<SubmitConfirmModal {...defaults} {...props} />)
}

describe('SubmitConfirmModal', () => {
  it('renders nothing when isOpen is false', () => {
    const { container } = renderModal({ isOpen: false })
    expect(container.firstChild).toBeNull()
  })

  it('shows answered / total count', () => {
    renderModal({ answered: 4, total: 5 })
    expect(screen.getByText('4 / 5')).toBeInTheDocument()
  })

  it('shows markedCount', () => {
    renderModal({ markedCount: 3 })
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('shows unanswered warning row when there are unanswered questions', () => {
    renderModal({ answered: 3, total: 5 })
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('Unanswered')).toBeInTheDocument()
  })

  it('hides unanswered row when all questions are answered', () => {
    renderModal({ answered: 5, total: 5 })
    expect(screen.queryByText('Unanswered')).toBeNull()
  })

  it('shows complete message when all answered', () => {
    renderModal({ answered: 5, total: 5 })
    expect(screen.getByText(/all questions answered/i)).toBeInTheDocument()
  })

  it('shows incomplete message with count when questions remain', () => {
    renderModal({ answered: 3, total: 5 })
    expect(screen.getByText(/2 questions left unanswered/i)).toBeInTheDocument()
  })

  it('singular unanswered message when exactly one remains', () => {
    renderModal({ answered: 4, total: 5 })
    expect(screen.getByText(/1 question left unanswered/i)).toBeInTheDocument()
  })

  it('Go Back button calls onCancel', () => {
    const onCancel = vi.fn()
    renderModal({ onCancel })
    fireEvent.click(screen.getByRole('button', { name: /go back/i }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('Confirm button has correct aria-label and calls onConfirm', () => {
    const onConfirm = vi.fn()
    renderModal({ onConfirm })
    const confirmBtn = screen.getByRole('button', { name: /confirm and submit exam/i })
    expect(confirmBtn).toBeInTheDocument()
    fireEvent.click(confirmBtn)
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('clicking overlay calls onCancel', () => {
    const onCancel = vi.fn()
    const { container } = renderModal({ onCancel })
    fireEvent.click(container.querySelector('.submit-confirm-overlay'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
