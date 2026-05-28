import { useState, useRef, useEffect } from 'react'
import { marked } from 'marked'
import MCQView from './MCQView'

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
  const scrollRef = useRef(null)

  const accent = CATEGORY_COLORS[skill.category] || '#1769C8'

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [output])

  const handleGenerate = async () => {
    if (!guide.trim() || isGenerating) return
    setOutput('')
    setMcqData(null)
    setIsGenerating(true)

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skillId: skill.id, guide })
      })

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
              setIsGenerating(false)
            }
          } catch { /* skip malformed SSE */ }
        }
      }
    } catch (err) {
      console.error(err)
      setIsGenerating(false)
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
            <textarea
              className="ws-textarea"
              placeholder={skill.template || 'Fill in the details for your content...'}
              value={guide}
              onChange={e => setGuide(e.target.value)}
            />
          </div>
          <div className="ws-form-footer">
            <button
              className="btn-generate"
              style={{ background: accent }}
              onClick={handleGenerate}
              disabled={!guide.trim() || isGenerating}
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
                {copied ? '✓ Copied' : 'Copy'}
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
                  __html: marked.parse(output) + (isGenerating ? '<span class="tcur"></span>' : '')
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
