import type { ParseIssue } from '../engine/parse'
import type { Suggestion } from '../engine/validate'

interface Props {
  title: string
  issues: ParseIssue[]
  /** If given, issues that carry a suggestion get one-click buttons to apply it. */
  onApply?: (issue: ParseIssue, choice: Suggestion) => void
}

/** A list of what is wrong with a drill, in plain terms. */
export function Issues({ title, issues, onApply }: Props) {
  return (
    <section className="issues" role="alert">
      <h2>{title}</h2>
      <ul>
        {issues.map((issue, i) => (
          <li key={i}>
            <code>{issue.location}</code> {issue.message}
            {onApply && issue.suggestion && (
              <span className="apply">
                {issue.suggestion.passSpeed !== undefined && (
                  <button type="button" onClick={() => onApply(issue, { passSpeed: issue.suggestion!.passSpeed })}>
                    Set pass speed to {issue.suggestion.passSpeed.toFixed(1)} ft/s
                  </button>
                )}
                {issue.suggestion.landAt && (
                  <button type="button" onClick={() => onApply(issue, { landAt: issue.suggestion!.landAt })}>
                    Land at {issue.suggestion.landAt[0].toFixed(1)}, {issue.suggestion.landAt[1].toFixed(1)}
                  </button>
                )}
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
