# Round 2 Independent Two-Axis Proposal Re-Review

- **Change**: `fix-systemone-abort-and-telemetry`
- **Review scope**: Remediated OpenSpec proposal package only. Application source and test files were read-only.
- **Pinned worktree HEAD**: `dfd81d65afc3f59888a02c1b4c80a303f13de2dc`
- **Verdict**: **APPROVED**
- **Round 1 disposition**: **B-01, B-02, B-03, B-04, and A-01 are resolved.**

## Independence and review method

`hermes --profile reviewer status` exited `0` and reported **Model: `cb-agent-reviewer`; Provider: `ai-router`**. This is independent of the exploration's cited Pass-A model (`cb-gemini-argon`).

This proposal-only review separated:

1. **Axis 1 — Standards / coherence / operational guardrails**: documented repository conventions, worktree isolation, executable proof quality, security-sensitive operational handling, and Fowler-smell heuristics.
2. **Axis 2 — Spec fidelity**: D-1 through D-4 in the canonical exploration against the proposal, design, tasks, and three delta specifications.

The `engineering/code-review` skill requires parallel delegate review. This runtime exposes no `delegate_task` tool; a read-only external-agent attempt (`agent ... --mode ask`) also failed with `agent: command not found` (exit `127`). No delegated result is claimed. The two axes below were independently inspected and reported without mixing their finding sets.

Required reviewer context was loaded: `open-sse/AGENTS.md`, `CLAUDE.md`, `docs/ARCHITECTURE.md`, the active delta specs, canonical exploration, Round-1 report, and current source seams. No project-local `code-review-mandate/spec.md` or `lessons-learned.md` exists in this worktree; searches found only cross-project/template copies, which were not substituted as repository policy.

## Deterministic evidence

| Check | Command / evidence | Result |
|---|---|---|
| Reviewer runtime independence | `hermes --profile reviewer status` | **PASS**, exit `0`: `cb-agent-reviewer` / `ai-router` |
| Protected primary checkout | `test -z "$(git -C 'O:/workspaces/oss/9router' status --porcelain)" && git -C "O:/workspaces/oss/9router" diff --exit-code && git -C "O:/workspaces/oss/9router" diff --cached --exit-code` | **PASS**, exit `0` |
| Worktree pinned base | `git -C "O:/workspaces/.worktrees/wt-9router-systemone-abort" rev-parse HEAD` | **PASS**: exactly `dfd81d65afc3f59888a02c1b4c80a303f13de2dc` |
| Worktree application/test scope | `test -z "$(git -C 'O:/workspaces/.worktrees/wt-9router-systemone-abort' status --porcelain -- open-sse src tests)"` | **PASS**, exit `0` |
| OpenSpec status | `C:/nvm4w/nodejs/openspec.EXE status --change fix-systemone-abort-and-telemetry --json` from worktree | **PASS**, exit `0`; `spec-driven`, all four planning artifacts `done`, `isPlanningComplete: true` |
| Strict OpenSpec validation | `C:/nvm4w/nodejs/openspec.EXE validate fix-systemone-abort-and-telemetry --strict --type change` from worktree | **PASS**, exit `0`: `Change 'fix-systemone-abort-and-telemetry' is valid` |
| Canonical/packaged exploration identity | `sha256sum` plus `sha256sum -c` | **PASS**, exit `0`; both bytes hash to `e860c79eb1aa5e717526676b238361f84e739294c04d887fa31b1982878551e9` |
| Worktree isolation topology | `git worktree list --porcelain`; `git branch --show-current` | **PASS**: dedicated worktree on `fix/systemone-abort-and-telemetry`; primary remains separate on `master` |

No application implementation exists in this proposal-only worktree, so no implementation test result is represented as acceptance evidence. The required future proof commands are now explicitly part of `tasks.md`.

## Axis 1 — Standards, coherence, Fowler smells, and operational guardrails

### Findings

**No blocking or advisory Axis-1 findings.**

- **B-01 resolved — clean protected checkout and isolated worktree.** The exact primary-cleanliness compound command now exits `0`; worktree HEAD is the requested pinned base; and `open-sse`, `src`, and `tests` are clean inside the worktree. `tasks.md:5` makes these pre-edit gates mandatory. This corrects the Round-1 inability to distinguish protected-checkout state from proposal work.
- **B-04 resolved — deployment proof is executable and self-verifying.** `tasks.md:20-23` supplies three exit-status-bearing post-cutover gates: (1) equality of `LOCAL_SHA`, NUC checkout SHA, and OCI revision label, base ancestry, and `RestartCount == 0`; (2) authenticated-if-configured `POST /v1/systemone` and `POST /v1/chat/completions` probes with HTTP/body assertions; and (3) inverse container-log assertion for `[AUTH] No credentials for ollaya`. The E2E command derives the optional API key from local config but prints only choice/model markers, not the credential. This matches the safe-fixture/redaction requirement.
- **A-01 resolved — configuration parser coverage is complete.** `tasks.md:6,8`, `design.md:27-35`, and `specs/systemone-dispatch/spec.md:21-24` specify positive-integer parsing with `"3500" → 3500` plus `""`, `"0"`, `"-500"`, `"abc"`, and `undefined` all falling back to `5000`.
- **Config-driven convention passes.** The change explicitly keeps provider/model literals out of `open-sse/handlers/systemoneCore.js` (`design.md:10,39`; `tasks.md:7`), consistent with `open-sse/AGENTS.md:11,24`.
- **Architecture/coherence passes.** The proposed composite abort seam has a single owner in the core and explicit cleanup (`design.md:41-54`); callers compose their cancellation budgets rather than duplicating failover policy (`design.md:56-60`).
- **Security review note.** The deployment E2E task uses an API key only in the in-memory Authorization header and does not echo it. The report does not execute deployment or read secrets.

### Fowler-smell heuristics

No material heuristic finding in the proposal: the design avoids duplicated timeout policy, speculative abstraction, and provider-specific branching in the generic dispatcher. The `servedBy` object is a cohesive domain record rather than a data clump; its contents are required by D-3 and the delta specifications.

**Axis-1 total: 0 findings. Worst issue: none.**

## Axis 2 — Fidelity to canonical Exploration D-1 through D-4

### D-1 — Abort propagation, endpoint cancellation, and cooldown suppression

**PASS; B-02 resolved.**

The canonical requirement requires forwarding `request.signal` through both endpoint paths, suppressing zombie failover, and avoiding false credential cooldown (`exploration:23-27, 72-80`). The plan implements that contract in `proposal.md:13-16`, `design.md:41-60`, and `specs/systemone-dispatch/spec.md:26-41`.

Most importantly, the formerly missing executable coverage is mandatory in `tasks.md:14`: direct `handleSystemone(request)` calls on both noAuth `ollaya/pplx-decider:flash-fp16` and credentialed `openrouter/typesafe/jev-1.13`; abort-aware fetch behavior; no `opencode-zen` call; no `Failing over to` warning; no `markAccountUnavailable`; and HTTP `408`. This closes the Round-1 direct-endpoint proof gap.

### D-2 — Dedicated 5,000ms local timeout and correct diagnostics

**PASS; A-01 resolved.**

The canonical exploration requires an overridable positive-integer 5,000ms local ceiling while retaining the cloud 60,000ms ceiling (`exploration:29-33, 47-61`). `systemone-dispatch/spec.md:9-24` preserves precisely those boundaries, while the defined tests in `tasks.md:6-8` cover valid and invalid overrides. `design.md:45-52` further separates caller abort from local expiry and prescribes distinct timeout versus connection-refusal diagnostic messages.

### D-3 — `servedBy` provenance and durable usage/detail metadata

**PASS; B-03 resolved.**

The exploration requires actual serving-provider attribution and persistence of metadata in both `usageHistory` and request details (`exploration:35-38, 72-80`). The return and persistence contract is consistent across `proposal.md:21-24`, `design.md:62-100`, `smart-router/spec.md:5-15`, and `systemone-usage-logs/spec.md:21-31`.

The former proof defect is closed explicitly at `tasks.md:14`: the future test must exercise both `saveRequestUsage → getUsageHistory` and `saveRequestDetail → await requestDetailsRepo.__test__.flushToDatabase() → getRequestDetails`, asserting the exact failover metadata object. The planned export of `flushToDatabase` is intentionally limited to `__test__`, providing deterministic repository verification without broadening production API surface.

### D-4 — Intel NUC cutover including `dfd81d65`

**PASS; B-04 resolved.**

The exploration calls for a clean protected checkout, a merged descendant of `dfd81d65`, backup/rebuild/recreate, revision identity, zero restart count, both live POST paths, and absence of the known Ollaya auth warning (`exploration:82-85`). `tasks.md:20-23` now maps each required acceptance condition to an executable, exit-status-bearing assertion. `design.md:141-146` retains the staged migration and rollback steps. The tasks do not claim deployment has occurred; they correctly defer those production assertions to the implementation/cutover phase.

### Scope check

No unsupported behavior or repository expansion was added. Explicit non-goals continue to exclude Hermes Nerve, Ollaya runtime configuration, and Hermes Agent UI work (`proposal.md:55-58`; `design.md:20-23`), consistent with the exploration (`exploration:95-98`).

**Axis-2 total: 0 findings. Worst issue: none.**

## Verdict

**APPROVED.** The remediated proposal package is internally coherent, faithfully covers D-1 through D-4, and converts every Round-1 blocking proof gap into an explicit implementation/test/deployment gate. Approval applies only to the OpenSpec planning package at pinned base `dfd81d65afc3f59888a02c1b4c80a303f13de2dc`; it is not approval of unimplemented source changes, NUC deployment, production behavior, or archival.

## Reproduction commands

```bash
hermes --profile reviewer status

test -z "$(git -C 'O:/workspaces/oss/9router' status --porcelain)" \
  && git -C "O:/workspaces/oss/9router" diff --exit-code \
  && git -C "O:/workspaces/oss/9router" diff --cached --exit-code

git -C "O:/workspaces/.worktrees/wt-9router-systemone-abort" rev-parse HEAD
test -z "$(git -C 'O:/workspaces/.worktrees/wt-9router-systemone-abort' status --porcelain -- open-sse src tests)"

cd "O:/workspaces/.worktrees/wt-9router-systemone-abort"
C:/nvm4w/nodejs/openspec.EXE status --change fix-systemone-abort-and-telemetry --json
C:/nvm4w/nodejs/openspec.EXE validate fix-systemone-abort-and-telemetry --strict --type change
sha256sum openspec/workspace/explorations/2026-11-05-9router-systemone-abort-timeout-telemetry-exploration.md \
  openspec/changes/fix-systemone-abort-and-telemetry/explorations/2026-11-05-9router-systemone-abort-timeout-telemetry-exploration.md
```