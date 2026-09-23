---
name: no-ai-slop
description: Review or clean up code for low-quality AI-generated patterns while preserving intended behavior and the repository's established style. Use when the user asks to remove AI slop, humanize code, audit generated code, clean up a diff, or apply a code-quality gate. Do not use for ordinary feature work unless the user requests this review.
---

# No AI Slop

Review the requested files or diff for concrete maintainability and correctness problems commonly introduced by generated code. Base every finding on repository evidence. The user's instructions take precedence over this skill.

## Preserve intent

- Read the applicable repository instructions and nearby code before judging style.
- Treat existing conventions as the baseline, including naming, comments, error handling, abstractions, tests, and formatting.
- Do not label code as AI-generated. Describe the observable problem and its impact.
- Do not rewrite code merely to make it different, shorter, cleverer, or more personally appealing.
- Preserve public APIs, user-visible behavior, data contracts, accessibility, and error semantics unless the user explicitly requests a change.
- Keep unrelated user changes intact. Do not broaden the cleanup beyond the requested scope.

## Choose the operating mode

Honor the user's requested level of action:

- **Review:** inspect and report findings; do not edit files.
- **Fix or clean up:** inspect, apply well-supported fixes, and verify them.
- **Gate:** inspect, verify, and return a pass, warn, or fail verdict. Only edit when the user also requested fixes.

If the request is ambiguous, infer the narrowest useful mode from the wording. A request to "review" is read-only; a request to "remove," "clean up," or "fix" authorizes edits in scope.

## Inspect the right evidence

Start with the current diff when one exists. Also inspect the surrounding functions, types, callers, tests, and configuration needed to understand intent. For a whole-repository request, prioritize changed, generated, or recently implicated files before expanding.

Use available formatters, linters, type checks, tests, and build commands as evidence. Do not mistake formatter preferences for substantive findings.

Look especially for:

- incorrect logic hidden behind plausible-looking structure;
- invented APIs, fields, routes, environment variables, or dependencies;
- swallowed errors, fake-success paths, and broad fallbacks that conceal failures;
- unsafe type escapes, unchecked casts, and avoidable loss of null or error handling;
- duplicated branches, dead code, stale compatibility paths, and unreachable conditions;
- abstractions, wrappers, factories, or helpers used once without reducing real complexity;
- comments and documentation that narrate syntax, restate names, make unsupported claims, or overwhelm the code;
- inconsistent naming or structure that conflicts with nearby repository conventions;
- placeholder UI copy, decorative interactions, nonfunctional controls, and disconnected handlers;
- tests that assert mocks rather than behavior, duplicate the implementation, or cannot fail for the intended regression;
- needless dependencies or reimplementations of utilities already present in the repository;
- large speculative changes unrelated to the request.

Do not apply a mechanical ban list. Repetition, defensive checks, comments, wrappers, or explicit code may be justified by the local architecture. Report or change them only when the surrounding evidence establishes a problem.

## Fix conservatively

When edits are authorized:

1. Correct correctness and safety issues before style problems.
2. Remove redundant generated scaffolding only when its behavior is understood.
3. Prefer the repository's existing utilities and patterns over introducing a new framework or dependency.
4. Keep patches small and reviewable. Avoid opportunistic rewrites.
5. Add or adjust tests when a behavioral defect is fixed and an appropriate test layer exists.
6. Run the narrowest relevant verification first, then broader checks when proportionate to the change.

If a suspected issue cannot be resolved without guessing, leave it unchanged and state the uncertainty.

## Gate and report

For gate requests, return one verdict:

- **PASS:** no material issue remains in scope and relevant verification passed.
- **WARN:** only low-confidence or low-impact concerns remain, or meaningful verification could not be run.
- **FAIL:** a correctness, security, data-loss, broken-interaction, or clearly blocking maintainability issue remains.

Do not invent a numeric score unless the user requests one. If requested, explain the scoring factors so the number is auditable rather than false precision.

End with a concise account of:

- material findings, ordered by impact and linked to files and lines;
- fixes made, if edits were authorized;
- checks run and their results;
- remaining risks or verification gaps;
- the gate verdict when requested.

If no material issues are found, say so directly. Do not manufacture findings to justify the review.
