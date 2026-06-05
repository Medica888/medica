import { useReducer, useEffect } from 'react'

function compute(a, b, op) {
  if (op === '+') return a + b
  if (op === '-') return a - b
  if (op === '*') return a * b
  if (op === '/') return b !== 0 ? a / b : NaN
  return b
}

function fmt(n) {
  if (!Number.isFinite(n)) return 'Error'
  const s = Number.isInteger(n) ? String(n) : parseFloat(n.toFixed(10)).toString()
  return s.length > 13 ? n.toExponential(5) : s
}

const INITIAL = { display: '0', prev: null, op: null, reset: false }

function reducer(state, action) {
  const { display, prev, op, reset } = state
  switch (action.type) {
    case 'DIGIT': {
      const d = action.value
      if (reset) return { ...state, display: d, reset: false }
      return { ...state, display: display === '0' ? d : display + d }
    }
    case 'DOT': {
      if (reset) return { ...state, display: '0.', reset: false }
      if (display.includes('.')) return state
      return { ...state, display: display + '.' }
    }
    case 'SIGN': {
      if (display === '0') return state
      return { ...state, display: display.startsWith('-') ? display.slice(1) : '-' + display }
    }
    case 'OP': {
      const cur = parseFloat(display)
      if (prev !== null && !reset) {
        const res = compute(prev, cur, op)
        return { display: fmt(res), prev: Number.isFinite(res) ? res : null, op: action.value, reset: true }
      }
      return { ...state, prev: cur, op: action.value, reset: true }
    }
    case 'EQ': {
      if (op === null || prev === null) return state
      const res = compute(prev, parseFloat(display), op)
      return { display: fmt(res), prev: null, op: null, reset: true }
    }
    case 'CLEAR': return INITIAL
    case 'BACK': {
      if (reset) return state
      return { ...state, display: display.length > 1 ? display.slice(0, -1) : '0' }
    }
    default: return state
  }
}

/**
 * Non-blocking slide-out calculator drawer with full keyboard support.
 * @param {{ isOpen: boolean, onClose: () => void }} props
 */
export default function CalculatorDrawer({ isOpen, onClose }) {
  const [state, dispatch] = useReducer(reducer, INITIAL)
  const { display } = state

  useEffect(() => {
    if (!isOpen) { dispatch({ type: 'CLEAR' }); return }
    const handler = (e) => {
      if (e.key === 'Escape') { onClose(); return }
      if (/^[0-9]$/.test(e.key)) { dispatch({ type: 'DIGIT', value: e.key }); return }
      if (e.key === '.')         { dispatch({ type: 'DOT' }); return }
      if (e.key === '+')         { dispatch({ type: 'OP', value: '+' }); return }
      if (e.key === '-')         { dispatch({ type: 'OP', value: '-' }); return }
      if (e.key === '*')         { dispatch({ type: 'OP', value: '*' }); return }
      if (e.key === '/')         { e.preventDefault(); dispatch({ type: 'OP', value: '/' }); return }
      if (e.key === 'Enter' || e.key === '=') { dispatch({ type: 'EQ' }); return }
      if (e.key === 'Backspace') { dispatch({ type: 'BACK' }); return }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const disp = display.length > 13 ? parseFloat(display).toExponential(5) : display

  const ROWS = [
    [{ l: 'C', cls: 'cmd', act: () => dispatch({ type: 'CLEAR' }) }, { l: '+/−', cls: 'cmd', act: () => dispatch({ type: 'SIGN' }) }, { l: '⌫', cls: 'cmd', act: () => dispatch({ type: 'BACK' }) }, { l: '÷', cls: 'op', act: () => dispatch({ type: 'OP', value: '/' }) }],
    [{ l: '7', act: () => dispatch({ type: 'DIGIT', value: '7' }) }, { l: '8', act: () => dispatch({ type: 'DIGIT', value: '8' }) }, { l: '9', act: () => dispatch({ type: 'DIGIT', value: '9' }) }, { l: '×', cls: 'op', act: () => dispatch({ type: 'OP', value: '*' }) }],
    [{ l: '4', act: () => dispatch({ type: 'DIGIT', value: '4' }) }, { l: '5', act: () => dispatch({ type: 'DIGIT', value: '5' }) }, { l: '6', act: () => dispatch({ type: 'DIGIT', value: '6' }) }, { l: '−', cls: 'op', act: () => dispatch({ type: 'OP', value: '-' }) }],
    [{ l: '1', act: () => dispatch({ type: 'DIGIT', value: '1' }) }, { l: '2', act: () => dispatch({ type: 'DIGIT', value: '2' }) }, { l: '3', act: () => dispatch({ type: 'DIGIT', value: '3' }) }, { l: '+', cls: 'op', act: () => dispatch({ type: 'OP', value: '+' }) }],
    [{ l: '0', cls: 'span2', act: () => dispatch({ type: 'DIGIT', value: '0' }) }, { l: '.', act: () => dispatch({ type: 'DOT' }) }, { l: '=', cls: 'eq', act: () => dispatch({ type: 'EQ' }) }],
  ]

  return (
    <div className="quiz-drawer calc-drawer" role="complementary" aria-label="Calculator">
      <div className="quiz-drawer-hdr">
        <div>
          <span className="quiz-drawer-title">Calculator</span>
          <span className="quiz-drawer-subtitle">Keyboard supported</span>
        </div>
        <button type="button" className="quiz-drawer-close" onClick={onClose} aria-label="Close calculator">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M3 3L11 11M11 3L3 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
        </button>
      </div>
      <div className="quiz-drawer-body calc-body">
        <div className="exam-calc-widget">
          <div className="exam-calc-display" aria-live="polite" aria-atomic="true">{disp}</div>
          <div className="exam-calc-grid">
            {ROWS.map((row, ri) => row.map((btn, bi) => (
              <button
                key={`${ri}-${bi}`}
                type="button"
                className={`exam-calc-btn${btn.cls ? ` ${btn.cls}` : ''}`}
                onClick={btn.act}
              >
                {btn.l}
              </button>
            )))}
          </div>
        </div>
      </div>
    </div>
  )
}
