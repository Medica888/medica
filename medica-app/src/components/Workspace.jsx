import { useState, useRef, useEffect } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import MCQView from './MCQView'
import { generate as generateApi } from '../lib/apiClient.js'
import { useAuthState } from '../hooks/useAuthState.js'

marked.setOptions({ breaks: true })

const CATEGORY_COLORS = {
  'Social Media':   '#1769C8',
  'Education':      '#0FAD6F',
  'Outreach':       '#E07B20',
  'USMLE Step 1':   '#1769C8',
  'USMLE Step 2':   '#6B3FBD',
}

export default function Workspace({ skill, onBack }) {
  const [guide, setGuide] = useState('')
  const [output, setOutput] = useState('')
  const [mcqData, setMcqData] = useState(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState(null)
  const scrollRef = useRef(null)
  const requestRef = useRef(null)
  const authState = useAuthState()

  const accent = CATEGORY_COLORS[skill.category] || '#1769C8'

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [output])

  useEffect(() => () => requestRef.current?.abort(), [])

  const handleGenerate = async () => {
    if (!guide.trim() || isGenerating) return
    if (!authState.isAuthenticated) {
      setError('Sign in from Settings to use live AI generation.')
      return
    }
    setOutput('')
    setMcqData(null)
    setError(null)
    setIsGenerating(true)
    requestRef.current?.abort()
    const controller = new AbortController()
    requestRef.current = controller

    try {
      const response = await generateApi.skillStream(
        { skillId: skill.id, guide },
        { signal: controller.signal },
      )

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop()

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const data = JSON.parse(line.slice(6))
            if (data.type === 'text') {
              accumulated += data.text
              setOutput(accumulated)
            } else if (data.type === 'done') {
              if (skill.mode === 'mcq') {
                try {
                  setMcqData(JSON.parse(accumulated))
                } catch {
                  // not valid JSON, render as text
                }
              }
              setIsGenerating(false)
            } else if (data.type === 'error') {
              setError(data.message || 'Generation failed. Please try again.')
              setIsGenerating(false)
            }
          } catch { /* skip malformed SSE */ }
        }
      }
    } catch (err) {
      if (err?.name !== 'AbortError') {
        setError(
          err?.status === 429
            ? 'AI generation is temporarily at capacity. Please try again shortly.'
            : err?.status === 401
            ? 'Your session expired. Sign in again from Settings.'
            : err?.message || 'Generation failed. Please try again.',
        )
      }
      setIsGenerating(false)
    } finally {
      if (requestRef.current === controller) requestRef.current = null
    }
  }

  const handleCopy = () => {
    if (!output) return
    navigator.clipboard.writeText(output).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const hasOutput = output.length > 0

  return (
    <div className="workspace">
      <div className="ws-header">
        <button className="ws-back" onClick={onBack}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M7.5 2L3.5 6L7.5 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back
        </button>
        <div className="ws-sep" />
        <span className="ws-emoji">{skill.emoji}</span>
        <div className="ws-info">
          <div className="ws-name">{skill.name}</div>
          <div className="ws-desc">{skill.description}</div>
        </div>
        <span className="ws-cat-badge" style={{ '--accent': accent }}>{skill.category}</span>
      </div>

      <div className="ws-body">
        {/* Left: Input */}
        <div className="ws-form-panel">
          <div className="ws-form-hdr">Your Guide</div>
          <div className="ws-form-body">
            <label className="sr-only" htmlFor="workspace-guide">Content generation guide</label>
            <textarea
              id="workspace-guide"
              className="ws-textarea"
              placeholder={skill.template || 'Fill in the details for your content...'}
              value={guide}
              onChange={e => setGuide(e.target.value)}
            />
          </div>
          <div className="ws-form-footer">
            {!authState.isAuthenticated && (
              <p className="ws-auth-note">Sign in from Settings to use live AI generation.</p>
            )}
            {error && <p className="ws-error" role="alert">{error}</p>}
            <button
              className="btn-generate"
              style={{ background: accent }}
              onClick={handleGenerate}
              disabled={!guide.trim() || isGenerating || !authState.isAuthenticated}
            >
              {isGenerating ? (
                <>
                  <div className="spinner" />
                  Generating...
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M2.5 7h9M8.5 3.5L12 7l-3.5 3.5" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Generate
                </>
              )}
            </button>
          </div>
        </div>

        {/* Right: Output */}
        <div className="ws-out-panel">
          <div className="ws-out-hdr">
            <span className="ws-out-hdr-left">Output</span>
            {hasOutput && (
              <button className={`ws-out-copy${copied ? ' copied' : ''}`} onClick={handleCopy}>
                {copied ? 'Copied' : 'Copy'}
              </button>
            )}
          </div>
          <div className="ws-out-scroll" ref={scrollRef}>
            {!hasOutput ? (
              <div className="out-placeholder">
                <div className="out-placeholder-ico">{skill.emoji}</div>
                <p>Fill in the guide and click Generate to create your content.</p>
              </div>
            ) : skill.mode === 'mcq' && mcqData ? (
              <MCQView data={mcqData} />
            ) : (
              <div
                className="out-body"
                dangerouslySetInnerHTML={{
                  __html: DOMPurify.sanitize(marked.parse(output)) + (isGenerating ? '<span class="tcur"></span>' : '')
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
