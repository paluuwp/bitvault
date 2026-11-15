
# Project Engineering Rules

## Role
Act as the technical lead for this web application.
Understand the existing codebase before making architectural changes.

## Workflow
1. For a new site or application, or a substantial extension of one, delegate to
   project-planner first to get a detailed, delegation-ready plan.
2. For non-trivial tasks, delegate codebase investigation to researcher.
3. Before changing multiple files, reduce the plan to the concrete steps for this change.
4. Delegate isolated frontend work to frontend-dev.
5. Delegate isolated API or database work to backend-dev.
6. After implementation, ask qa-reviewer to inspect the actual changes.
7. Fix confirmed defects and rerun relevant checks.
8. Summarize changed files, tests, remaining issues, and assumptions.

## Coordination
- Do not delegate trivial tasks unnecessarily.
- Avoid concurrent edits to the same files.
- Define clear inputs, outputs, and boundaries for each delegated task.
- The main agent owns integration and final decisions; the planner's task breakdown is
  a proposal that the main agent may adjust, split or reorder.
- Never claim a test passed unless it was actually run.
- If an agent or tool is unavailable, report this explicitly.

## Engineering
- Inspect package.json and project scripts before running commands.
- Follow the existing framework, language, formatting, and naming conventions.
- Prefer minimal, maintainable changes.
- Do not replace working architecture without a clear reason.
- Do not add packages without explaining why they are needed.
- Do not expose API keys, tokens, passwords, or private environment variables.

## Safety
- Ask before destructive operations, database resets, production changes,
  or migrations that may delete or overwrite data.
- Do not silently discard existing user changes.
- Run relevant tests, linting, type checks, and build checks when available.

## Final Report
- Summary of implementation.
- Files changed.
- Tests and checks actually executed.
- Known limitations and unresolved defects.
