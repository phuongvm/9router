## Execution Ownership and Completion Gates

- The local implementation worker owns sections 1–3 (tasks 1.1–3.4; OpenSpec apply IDs 1–12). A verified 12/16 state is the required local implementation handoff to independent implementation review, not completion of this OpenSpec change.
- Independent implementation review gates all production work. The Intel NUC deployment worker owns task 4.1 (ID 13), and independent production QA owns tasks 4.2–4.4 (IDs 14–16).
- Section 4 remains in this checklist for end-to-end traceability. Its tasks are post-review downstream acceptance, not coder-local apply acceptance.
- The change remains in progress and must not be archived or declared complete until all sixteen tasks are independently verified and checked. Local test success is not production completion, and deployment success alone is not a verified production fix.

## 1. Compatibility Policy and Pure Transformation

- [x] 1.1 Add an Antigravity-specific frozen ordered replacement table under `open-sse/config/` with the exact Hermes/Nous → neutral sentence and Claude/Anthropic → empty-string entries; verify a focused config test asserts the complete ordered table and that no regex or fuzzy matcher is exported.
- [x] 1.2 Add the pure `open-sse/utils/` semantic-identity helper that inspects only string `systemInstruction.parts[].text`, performs literal case-sensitive replacements, and returns the original value for absent, malformed, or unmatched inputs; verify focused unit cases cover both exact phrases, wording/case/punctuation near misses, and non-throwing malformed inputs.
- [x] 1.3 Implement structural copy-on-write in the helper so only changed part objects, the parts array, and the containing instruction are cloned without flattening, trimming, joining, or deleting empty/non-text parts; verify tests cover multipart boundaries, non-text fields, byte-for-byte behavioral suffix preservation, unchanged-object identity for no-op inputs, and unchanged input snapshots.
- [x] 1.4 Verify deterministic and idempotent output by applying the helper repeatedly to fixtures containing one match, repeated matches, both policy phrases, and no match, and assert the second output is deeply equal to the first.

## 2. Antigravity Executor Integration

- [x] 2.1 Integrate the helper only in the standard non-image `AntigravityExecutor.transformRequest` path after provider-format translation and before outbound request assembly, replacing the inline Claude rewrite; verify executor tests prove Hermes neutralization and existing Claude removal while the image path and non-Antigravity executors/translators remain untouched.
- [x] 2.2 Refactor the affected transform path to copy the top-level body and nested request before blacklist deletion or semantic text changes, without changing existing Antigravity normalization; verify a deep pre/post input snapshot remains equal after transformation for matched and unmatched fixtures.
- [x] 2.3 Add paired matched/unmatched executor fixtures and verify that only targeted `systemInstruction.parts[].text` differs while contents, tools, tool configuration, generation configuration, safety handling, session/request IDs, model, project/account context, request type, and other envelope metadata remain equivalent.
- [x] 2.4 Confirm the helper and integration add no prompt- or credential-derived logging; verify focused tests use a logger spy or source-level assertion to show neutralized, skipped, and downstream-error paths emit no system text, attribution text, access token, refresh token, memory, or private project context.

## 3. Automated Regression Verification

- [x] 3.1 Run the focused semantic-identity helper and Antigravity executor test files with `npx vitest run --config tests/vitest.config.js <focused-files>` from the repository root and record passing output for exact matching, preservation, malformed input, idempotency, immutability, envelope integrity, confidentiality, and provider isolation.
- [x] 3.2 Run `npx vitest run --config tests/vitest.config.js tests/translator/bugs-antigravity.test.js tests/unit/antigravity-retry-hook.test.js` and verify existing translator, Claude compatibility, request normalization, and retry-hook behavior has no new failure.
- [x] 3.3 Run the repository no-regression baseline using its committed `tests/__baseline__/verify-no-regression.mjs` procedure and verify the change introduces no result outside the documented baseline; report unrelated known failures separately rather than classifying them as this change's regressions.
- [x] 3.4 Review `git diff -- open-sse tests openspec/changes/normalize-antigravity-semantic-identity` and verify runtime edits are limited to Antigravity compatibility configuration, helper, executor integration, and focused tests, with no Hermes-global identity, OAuth, account selection, quota, retry/backoff, fallback, or unrelated provider change.

## 4. Post-Review Downstream Deployment and Production Acceptance

- [x] 4.1 After explicit deployment authorization, build the actual serving artifact/image with the project's production build procedure, deploy it, restart the 9Router service, and verify service health plus deployed version/image evidence shows the new artifact is running; do not classify local source or unit results as a production fix.
- [x] 4.2 Run at least three fresh strict Agent4070 Hermes primary turns through the intended Antigravity account/model and verify each returns the intended Gemini response model, shows the expected live `STREAM · 2 MSG · 46 TOOL` fingerprint (or the documented current equivalent), has no primary `RESOURCE_EXHAUSTED`, and activates no fallback.
- [x] 4.3 Classify title, memory, JSON, and other auxiliary requests separately from the strict primary turns, then attach sanitized runtime evidence containing route/model/account outcome and status only; verify no full prompt, credential, token, memory, or private project context is captured.
- [x] 4.4 If automated or live gates fail, restore the prior deployed artifact, restart the service, and verify health and prior behavior are restored; if all gates pass, record the change as production-verified with the three-turn evidence and rollback reference.
