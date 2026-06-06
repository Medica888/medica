/**
 * @param {{
 *   highlights: Array<{start:number,end:number,color:string}>
 *   activeColor?: string
 *   onChangeColor: (color: string) => void
 *   onClear: () => void
 * }} props
 */
export default function QuizHighlightToolbar({ highlights = [], activeColor = 'yellow', onChangeColor, onClear }) {
  return (
    <div className="hl-toolbar" role="toolbar" aria-label="Highlight tool">
      <span className="hl-label">Highlight</span>
      {['yellow', 'blue', 'green', 'pink'].map(color => (
        <button
          key={color}
          type="button"
          className={`hl-btn hl-${color}${activeColor === color ? ' active' : ''}`}
          onClick={() => onChangeColor(color)}
          aria-label={`${color} highlight`}
          aria-pressed={activeColor === color}
        />
      ))}
      {highlights.length > 0 && (
        <button type="button" className="hl-btn hl-clear" onClick={onClear} aria-label="Clear all highlights">
          Clear
        </button>
      )}
    </div>
  )
}
