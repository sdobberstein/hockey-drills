import { useState } from 'react'

interface Props {
  label: string
  value: string
  /** Called once when editing finishes (blur, or Enter in a one-line field). */
  onCommit: (value: string) => void
  multiline?: boolean
  placeholder?: string
}

/**
 * A text field that changes the drill once, when you finish typing, rather
 * than on every keystroke. Otherwise each letter would be its own undo step.
 *
 * While you type it keeps its own text. If the drill's value changes from
 * outside (undo, redo), it adopts that value: React's "adjust state while
 * rendering" pattern, which avoids an effect and a flash of stale text.
 */
export function CommitField({ label, value, onCommit, multiline, placeholder }: Props) {
  const [text, setText] = useState(value)
  const [seen, setSeen] = useState(value)
  if (value !== seen) {
    setSeen(value)
    setText(value)
  }

  const finish = () => {
    if (text !== value) onCommit(text)
  }

  return (
    <label className="field">
      <span>{label}</span>
      {multiline ? (
        <textarea rows={3} value={text} placeholder={placeholder} onChange={(e) => setText(e.target.value)} onBlur={finish} />
      ) : (
        <input
          type="text"
          value={text}
          placeholder={placeholder}
          onChange={(e) => setText(e.target.value)}
          onBlur={finish}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
          }}
        />
      )}
    </label>
  )
}
