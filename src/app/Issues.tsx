import type { ParseIssue } from '../engine/parse'

/** A list of what is wrong with a drill, in plain terms. */
export function Issues({ title, issues }: { title: string; issues: ParseIssue[] }) {
  return (
    <section className="issues" role="alert">
      <h2>{title}</h2>
      <ul>
        {issues.map((issue, i) => (
          <li key={i}>
            <code>{issue.location}</code> {issue.message}
          </li>
        ))}
      </ul>
    </section>
  )
}
