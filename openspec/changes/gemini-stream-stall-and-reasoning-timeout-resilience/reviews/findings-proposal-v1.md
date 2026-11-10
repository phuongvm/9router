# Two-Axis Independent Proposal Review — v1

- **Change**: `gemini-stream-stall-and-reasoning-timeout-resilience`
- **Worktree / pinned HEAD**: `O:/workspaces/.worktrees/wt-9router-gemini-stream-resilience` @ `0598f9f0fd6c14e27117bffadd0815e1799025b1`
- **Review phase**: Proposal; no implementation, deployment, or archive action was performed by Reviewer.
- **Reviewer runtime**: `cb-agent-reviewer` via `ai-router` (active Hermes session runtime).
- **Verdict**: **REJECTED**

## 1. Executive Summary

The proposal accurately scopes the intended three-seam Option 2 change, preserves the F1/F5 boundaries, makes the D-1 behavioural break explicit and gated, and supplies a generally strong tracer-bullet task plan. The required strict OpenSpec validation and requested baseline Vitest selection both independently pass.

Approval is blocked by two delta-spec scenarios that omit a required `GIVEN` clause. The review mandate requires valid `GIVEN`/`WHEN`/`THEN` scenarios, so a strict proposal review cannot approve the artifact while `spec.md` lines 32–34 and 82–84 are incomplete. A secondary task-proof finding is included because task 1.2 names a non-shell tool outcome rather than a runnable, reproducible command.

No production source boundary is dirty: `git status --short -- src open-sse tests` returned no entries. The only worktree modifications are proposal artifacts, their exploration mirror/canonical copy, and the required collaboration log.

## 2. Evidence Ledger

| Check | Command / inspection | Result |
|---|---|---|
| Fixed point | `git rev-parse HEAD` | `0598f9f0fd6c14e27117bffadd0815e1799025b1` |
| Planning artifacts | `openspec status --change gemini-stream-stall-and-reasoning-timeout-resilience --json` | `proposal`, `specs`, `design`, `tasks`: all `done`; planning complete |
| Strict structural validation | `openspec validate "gemini-stream-stall-and-reasoning-timeout-resilience" --strict` | **PASS**, exit `0`: `Change ... is valid` |
| Required baseline suites | `cd tests && npx vitest run unit/combo-empty-failover.test.js unit/gemini-4-argon.test.js unit/responses-abort-terminal.test.js` | **PASS**, exit `0`: 3 files, 84 tests |
| Source mutation guard | `git status --short -- src open-sse tests` | **PASS**: no output |
| Diff whitespace guard | `git diff --check` | **PASS**, exit `0` |
| Exploration integrity | `sha256sum` canonical and mirrored exploration | **PASS**: both `a8ae5f30d3618893ed3094a9ed1db5b9c325327008d035cfe878e5655efd5e8c` |
| Requirement paragraph limit | independent length scan of requirement paragraphs | **PASS**: 6 requirements; maximum 382 chars (limit 500) |
| Scenario grammar scan | independent scan of 16 scenarios for `GIVEN`, `WHEN`, `THEN` | **FAIL**: two scenarios omit `GIVEN` (B-01) |

## 3. Two-Axis Findings

| ID | Axis | Severity | Evidence | Finding / required correction |
|---|---|---|---|---|
| B-01 | Standards & OpenSpec discipline | **BLOCKER** | `specs/stream-stall-resilience/spec.md:32-34`, scenario **“Reasoning is still not classified as content”** contains only WHEN/THEN; `:82-84`, **“Existing provider budgets are unchanged”** contains only WHEN/THEN. Independent grammar scan found 2/16 scenarios lacking `GIVEN`. | The review mandate requires valid `GIVEN`/`WHEN`/`THEN` scenarios. Add a concrete Given precondition to each scenario (e.g., a delta with a non-empty reasoning field; initialized resolved provider config) without weakening the behavioral assertion. Re-run strict validation and the grammar scan. |
| W-01 | Standards & proof discipline | **WARNING** | `tasks.md:16-17` makes task 1.2 proof `search_files ... returns 0 matches`. This is a tool-description, not a runnable command that emits an exit status; it also does not prove the required schema constants were added. | Replace/add an executable proof, for example a command that asserts the named exports and uses `! rg -n '"thinking_delta"' open-sse/services`; retain focused Vitest coverage proving event recognition. |
| I-01 | Standards & engineering design | **INFO** | `design.md:59-64`, `:85-104`; current `emptyFailover.js:36-45`, `:109-136`, `:152-196`; current `streamHandler.js:195-245`. | No Fowler blocker identified. The design avoids a shallow semantic change: it preserves `deltaHasClientContent` and adds a separate reasoning-progress signal; it avoids speculative per-provider first-chunk config by retaining one actual provider budget seam. This is a sound deep-module direction. |
| I-02 | Review governance | **INFO** | Repository search did not find project-local `code-review-mandate/spec.md`, `lessons-learned.md`, or reviewer memory. `CLAUDE.md` and `open-sse/AGENTS.md` were loaded; both bind the applicable architecture/conventions. | Publish or point reviewers to the project-local mandate and lessons paths before the next review. This did not alter the explicit proposal checks above. |

### Axis 1 — Standards & Engineering Disciplines

**Status: FAIL (1 BLOCKER, 1 WARNING, 2 INFO).**

- **OpenSpec invariants**: Requirement prose is within the 500-character limit; strict validator passes; 14/16 scenarios include all three Gherkin clauses. B-01 prevents a full pass.
- **Tracer-bullet plan**: RED/GREEN intent, dependencies, focused suite names, snapshot control, NUC gates, and 24-hour QA evidence are concrete. W-01 leaves one proof non-runnable under the mandated proof-command rule.
- **Deep-module / Fowler review**: No evidence of Mysterious Name, Duplicated Code, Feature Envy, Data Clumps, Primitive Obsession, Repeated Switches, Shotgun Surgery, Divergent Change, Speculative Generality, Message Chains, Middle Man, or Refused Bequest in the *proposal design*. The principal design choices are appropriately narrow: a separate `reasoning` signal rather than changing the meaning of a public content predicate, registry data rather than a new execution path, and a phase label internal to `pipeWithDisconnect`.
- **Proposal-phase scope**: PASS. No mutation exists under `src`, `open-sse`, or `tests`; only proposal material and session coordination are present.

### Axis 2 — Spec & Exploration Fidelity

**Status: PASS subject to B-01 remediation. No fidelity blocker found.**

| Exploration finding / required scope | Fidelity evidence |
|---|---|
| **F1 — upstream heavy TTFT; not locally solvable** | `proposal.md:38` and `design.md:75,112` expressly retain TTFT >600s as residual risk and task 4.3 measures it. No false claim of eliminating upstream prefill latency. |
| **F2 — reasoning is held by empty peek** | Seam 1 in `proposal.md:19`, D-1 in `design.md:57-75`, requirement at `spec.md:7-34`, and tasks 1.1–1.4 create an independent reasoning-progress signal while retaining content semantics. This matches current source: `emptyFailover.js:34-35` deliberately excludes reasoning. |
| **F3 — one 360s watchdog covers first byte and idle** | Seam 2 adds the required Antigravity 600000-ms provider value (`proposal.md:20`; `spec.md:68-84`; tasks 2.1–2.3). Seam 3 identifies whether the one resolved budget fired before any byte or after a chunk (`proposal.md:21`; `spec.md:86-106`; tasks 3.1–3.2). Current source confirms the single timer at `streamHandler.js:195-245` and resolution at `streamingHandler.js:97-98`. |
| **F4 — first-chunk constant is Kiro-only / unwired on chat path** | `proposal.md:21`, `design.md:85-93`, `spec.md:108-115`, and task 3.3 explicitly clarify rather than wire the 200s constant. Current source confirms Kiro is its consumer (`executors/kiro.js`) and chat uses the provider/global stall budget. |
| **F5 — connect timeout disproven** | `proposal.md:44` and `design.md:27` keep `FETCH_CONNECT_TIMEOUT_MS` out of scope, consistent with the exploration’s zero-occurrence evidence. |
| **Option 2 boundaries** | All three mandated seams are bounded to `emptyFailover`, `antigravity.transport.stallTimeoutMs: 600000`, and phase-labelled watchdog behavior. The proposal rejects adaptive combo/hedging, a new per-provider first-chunk field, global stall changes, and `delta.thought` with evidence of zero producers. |
| **D-1 break** | Explicit in `proposal.md:23`, `design.md:66`, `spec.md:58-66`, and mandatory commander gate `tasks.md:9-10`. The plan correctly states that released reasoning makes cross-seat retry unsafe and inverts exactly the existing reasoning-fallthrough tests. |

## 4. Runtime Provider & Model Verification Evidence

| Item | Evidence | Result |
|---|---|---|
| Reviewer runtime identity | Active Hermes profile/session context | `cb-agent-reviewer` through `ai-router` |
| Target model scope | `proposal.md:5`, exploration `:57-60` | `cb-gemini-argon` combo targets Antigravity Gemini 4 Argon high → medium → low; long-context/high-reasoning fault domain is correctly identified |
| Existing runtime behavior | Source inspected at `emptyFailover.js:34-35`, `streamingHandler.js:97-98`, `streamHandler.js:208-214`, `runtimeConfig.js:51-56`, registry `antigravity.js:21-46` | Reasoning currently falls through; provider override is absent; current watchdog emits only `stream stall timeout`; first-chunk constant is not used by chat; proposal targets the verified seams |
| Requested regression selection | Vitest output captured independently | 84/84 assertions pass, exit 0 |

## 5. Required Rework and Re-review Gate

1. **Resolve B-01**: Add a `GIVEN` clause to `spec.md` scenarios at lines 32 and 82. Preserve their current WHEN/THEN behavior.
2. **Resolve W-01**: Replace/add task 1.2 proof with an executable command with a meaningful exit code and a check for both constants and the prohibited service literal.
3. Re-run and attach actual output for:
   ```bash
   openspec validate "gemini-stream-stall-and-reasoning-timeout-resilience" --strict
   cd tests && npx vitest run unit/combo-empty-failover.test.js unit/gemini-4-argon.test.js unit/responses-abort-terminal.test.js
   ```
4. Request an independent proposal re-review. No apply, deployment, or archive action is approved until the verdict changes to APPROVED.

## 6. Scope / Kanban Note

No canonical Kanban card ID was supplied or discoverable in the change artifacts/session log. The DeskRPG review-card proposal (`e1b27e2fd16e4ad2bd8daa0d6421aa71`) is only a proposal and does not create mutable Kanban metadata. The required persistent progress update is appended to `openspec/workspace/sessions/agent_share.md`.
