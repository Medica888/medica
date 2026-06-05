import { useRef } from 'react'

function getTextOffset(container, targetNode, targetOffset) {
  let total = 0
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
  let current
  while ((current = walker.nextNode())) {
    if (current === targetNode) return total + targetOffset
    total += current.nodeValue.length
  }
  return -1
}

function buildSegments(text, highlights) {
  if (!highlights || highlights.length === 0) return [{ text, color: null }]
  const sorted = [...highlights].sort((a, b) => a.start - b.start)
  const merged = []
  for (const h of sorted) {
    const last = merged[merged.length - 1]
    if (last && h.start < last.end) {
      last.end = Math.max(last.end, h.end)
    } else {
      merged.push({ start: h.start, end: h.end, color: h.color })
    }
  }
  const segments = []
  let pos = 0
  for (const h of merged) {
    if (h.start > pos) segments.push({ text: text.slice(pos, h.start), color: null })
    segments.push({ text: text.slice(h.start, h.end), color: h.color })
    pos = h.end
  }
  if (pos < text.length) segments.push({ text: text.slice(pos), color: null })
  return segments
}

/**
 * Renders text with highlight spans. Mouseup inside triggers onHighlight(start, end, color).
 * @param {{ text: string, highlights: Array<{start:number,end:number,color:string}>, activeColor?: string, onHighlight?: Function, enabled?: boolean, className?: string }} props
 */
export default function HighlightedText({ text, highlights = [], activeColor = 'yellow', onHighlight, enabled = true, className = '' }) {
  const containerRef = useRef(null)

  const handleMouseUp = () => {
    if (!enabled || !onHighlight) return
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || !sel.rangeCount) return
    const range = sel.getRangeAt(0)
    const container = containerRef.current
    if (!container || !container.contains(range.commonAncestorContainer)) return
    const start = getTextOffset(container, range.startContainer, range.startOffset)
    const end   = getTextOffset(container, range.endContainer,   range.endOffset)
    if (start < 0 || end <= start) return
    onHighlight(start, end, activeColor)
    sel.removeAllRanges()
  }

  const segments = buildSegments(text, highlights)

  return (
    <p ref={containerRef} onMouseUp={handleMouseUp} className={className || undefined}>
      {segments.map((seg, i) =>
        seg.color
          ? <mark key={i} className={`hl-${seg.color}`}>{seg.text}</mark>
          : <span key={i}>{seg.text}</span>
      )}
    </p>
  )
}
