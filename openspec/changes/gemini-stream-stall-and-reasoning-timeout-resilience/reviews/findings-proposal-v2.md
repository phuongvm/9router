# Two-Axis Independent Proposal Re-Review — v2

- **Change**: `gemini-stream-stall-and-reasoning-timeout-resilience`
- **Worktree / pinned HEAD**: `O:/workspaces/.worktrees/wt-9router-gemini-stream-resilience` @ `0598f9f0fd6c14e27117bffadd0815e1799025b1`
- **Review phase**: Proposal only. No implementation, deployment, archive, or production action was performed.
- **Reviewer runtime**: `cb-agent-reviewer` through `ai-router`.
- **Verdict**: **APPROVED**

## 1. Decision

Round-1 blocker **B-01** and warning **W-01** are resolved. The delta spec now has valid GIVEN/WHEN/THEN grammar in every scenario, and task 1.2 now specifies an executable Node import assertion chained to an exit-status-bearing `grep` absence assertion instead of describing a tool result. Strict OpenSpec validation and the requested baseline Vitest selection independently pass.

This approval is limited to the proposal artifacts. Apply remains blocked by unchecked task **0.1**: Commander acceptance of the D-1 breaking think-then-abort behaviour. No source files under `src`, `open-sse`, or `tests` are modified.

## 2. Evidence Ledger

| Check | Command / inspection | Result |
|---|---|---|
| Fixed point | `git rev-parse HEAD` | **PASS** — `0598f9f0fd6c14e27117bffadd0815e1799025b1` |
| Planning completeness | `openspec status --change gemini-stream-stall-and-reasoning-timeout-resilience --json` | **PASS** — `proposal`, `specs`, `design`, and `tasks` are `done`; `isPlanningComplete: true` |
| Strict structural validation | `openspec validate "gemini-stream-stall-and-reasoning-timeout-resilience" --strict` | **PASS**, exit `0` — `Change 'gemini-stream-stall-and-reasoning-timeout-resilience' is valid` |
| Required baseline suites | `cd tests && npx vitest run unit/combo-empty-failover.test.js unit/gemini-4-argon.test.js unit/responses-abort-terminal.test.js` | **PASS**, exit `0` — 3 files, 84 tests passed, 2.72 s |
| B-01 scenario grammar | Independent parser over delta spec | **PASS** — 16/16 scenarios contain GIVEN, WHEN, and THEN |
| Requirement length | Independent parser over delta spec | **PASS** — 6 requirements; maximum normative paragraph is 382 chars (limit 500) |
| W-01 proof form | `tasks.md:16-17` inspection and static command-shape assertions | **PASS** — proof is a runnable `node -e 'import(...)'` assertion followed by `&& ! grep -rn ...`; each command communicates failure by non-zero status |
| Whitespace | `git diff --check` | **PASS**, exit `0` |
| Protected source areas | `git status --short -- src open-sse tests` | **PASS** — no output |
| Exploration integrity | Canonical/mirrored exploration inspection; pinned SHA recorded in `design.md:5` | **PASS** — proposal cites canonical SHA `a8ae5f30d3618893ed3094a9ed1db5b9c325327008d035cfe878e5655efd5e8c`; both review inputs are present |

### Re-review disposition of prior findings

| Prior ID | Result | Verifiable evidence |
|---|---|---|
| **B-01** | **RESOLVED** | `specs/stream-stall-resilience/spec.md:32-35` now supplies a concrete delta-payload GIVEN for “Reasoning is still not classified as content.” `:83-86` now supplies a concrete configured-registry GIVEN for “Existing provider budgets are unchanged.” The independent scan reports all 16 scenarios with all three mandatory clauses. |
| **W-01** | **RESOLVED** | `tasks.md:16-17` replaces the narrative `search_files` tool outcome with a shell-executable Node ESM import assertion plus negative `grep` check. It has standard process exit semantics and can be run from the repository root when task 1.2 is implemented. |

> The task-1.2 proof command is deliberately a **planned implementation proof**, not a current-baseline test: the required schema constants do not exist before the future task is performed. The reviewer verified that the task now defines a reproducible command with exit-status semantics; no false claim is made that its future assertion already passes on the unimplemented baseline.

## 3. Two-Axis Review

### Axis 1 — Standards, OpenSpec Discipline, and Fowler Smells

**Status: PASS. No blocker, warning, or actionable standards finding.**

- **Gherkin completeness**: The grammar scan passes for all 16 scenarios. The two formerly incomplete scenarios now have specific, non-vacuous GIVEN preconditions:
  - `spec.md:32-35` describes a reasoning-only delta before calling `deltaHasClientContent`.
  - `spec.md:83-86` establishes the `qoder`/`qoder-cn` resolved provider registry before assertions.
- **Requirement concision**: All six normative requirement paragraphs are within the 500-character mandate; the largest is the reasoning-frame requirement at 382 characters.
- **Proof discipline**: `tasks.md:16-17` uses an actual Node command and a negated `grep` command chained with `&&`, correcting the prior non-executable prose. The task plan otherwise preserves RED→GREEN sequencing, dependency gates, focused proofs, snapshot scope control, deployment gating, and 24-hour QA evidence.
- **Scope / hygiene**: `git diff --check` passes and `git status --short -- src open-sse tests` is empty. The worktree has expected proposal/session artifacts only; no implementation source/test boundary is dirty.
- **Standards and Fowler baseline**: No proposal-level evidence of Mysterious Name, Duplicated Code, Feature Envy, Data Clumps, Primitive Obsession, Repeated Switches, Shotgun Surgery, Divergent Change, Speculative Generality, Message Chains, Middle Man, or Refused Bequest. The design correctly keeps content and reasoning-progress semantics distinct (`design.md:57-75`), uses existing registry configuration rather than a new execution path (`:77-83`), and retains a single watchdog-budget interface rather than adding a one-adapter configuration seam (`:85-93`).

### Axis 2 — Spec and Exploration Fidelity

**Status: PASS. No fidelity blocker or scope-creep finding.**

| Exploration finding / required boundary | Fidelity evidence |
|---|---|
| **F1 — upstream high-tail TTFT is the root driver and not locally eliminated** | `proposal.md:38` and `design.md:75,112` state that streams exceeding 600 s still fail and task 4.3 measures the residual. No claim is made to fix upstream Google prefill. |
| **F2 — empty peek suppresses reasoning frames** | Seam 1 (`proposal.md:19`), D-1 (`design.md:57-75`), the first delta requirement (`spec.md:7-35`), and tasks 1.1–1.4 define a separate reasoning-progress signal while keeping `deltaHasClientContent` semantic meaning unchanged. Baseline source supports this: `emptyFailover.js:26-45,47-52,109-196` excludes reasoning from content and waits on `sawContent`. |
| **F3 — a single 360 s watchdog covers prefill and inter-chunk idle** | Seam 2 sets Antigravity to 600000 ms (`proposal.md:20`; `spec.md:69-86`); Seam 3 labels whether that one budget fired before or after a byte (`proposal.md:21`; `spec.md:88-108`). Current source resolves `PROVIDERS[provider]?.stallTimeoutMs || STREAM_STALL_TIMEOUT_MS` in `streamingHandler.js:97-98` and arms/re-arms a single timer in `streamHandler.js:195-245`. |
| **F4 — `STREAM_FIRST_CHUNK_TIMEOUT_MS` is Kiro-only, not chat-path wiring** | `proposal.md:21`, `design.md:85-93`, `spec.md:110-117`, and task 3.3 choose clarification, not wiring. Current consumers are only `runtimeConfig.js:55-56` and `executors/kiro.js:12,380`; the chat streaming resolution uses the provider/global stall budget. |
| **F5 — fetch connect timeout is disproven and remains out of scope** | `proposal.md:44` and `design.md:27` explicitly exclude `FETCH_CONNECT_TIMEOUT_MS`. Current code still uses it in the executor connection path (`executors/base.js:139`), rather than the proposed streaming seam. |
| **Option 2 boundaries** | The proposal remains confined to: reasoning progress in `emptyFailover`, Antigravity registry `stallTimeoutMs: 600000`, and phase-labelled watchdog behaviour. It excludes adaptive combo/hedging, global stall increase, a new per-provider first-chunk field, `delta.thought` without a producer, context compaction, and Hermes timer tuning (`proposal.md:17-23,38-44`; `design.md:68-93`). |
| **D-1 breaking gate** | The incompatible think-then-abort consequence is explicit in `proposal.md:23`, `design.md:66`, and `spec.md:59-67`; task `0.1` remains unchecked in `tasks.md:9-10`, and `design.md:124,131` assigns Commander acceptance before apply. |

## 4. Security Note

This is a planning-only change. No auth, token/credential storage, header forwarding, network destination, or secret-bearing production source was modified. The proposal targets stream classification and timeout semantics only; its required future tests and deployment checks must continue to preserve existing terminal error formatting and avoid logging upstream payloads or credentials.

## 5. Collaboration and Kanban State

- The Round-2 verdict and command evidence are appended to `openspec/workspace/sessions/agent_share.md`.
- No canonical Kanban card ID or mutable Kanban metadata is recorded in the change artifacts or session log. The previous DeskRPG review-card reference is explicitly a proposal, not a created card; therefore no Kanban metadata mutation is possible without inventing an ID.
- The requested two-axis delegate dispatch was attempted, but the configured remote delegation tool rejected host alias `agent4070` as unknown before execution. The final report therefore preserves separate Standards and Spec-fidelity evidence gathered independently in this reviewer session; no delegated result is represented as having run.

## 6. Approval Boundary / Next Gate

Proposal review is approved. The team may not begin implementation until the Commander records task 0.1 acceptance of D-1 and answers the two open questions. This verdict does not approve apply, deployment, production verification, completion, or archive.

