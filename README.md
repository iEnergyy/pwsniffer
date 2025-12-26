# PWSniffer

**Playwright Sniffer** - AI-powered test failure analysis tool

A personal, stateless MVP that uses Vercel AI SDK multi-agent reasoning to analyze a single Playwright test run and explain:

- What failed
- Why it likely failed
- Whether it is a test issue or an application issue
- What to do next

This project is intentionally stateless:

❌ No databases
❌ No historical metrics
❌ No Grafana / Prometheus
❌ No learning from past runs

Everything is inferred only from the artifacts of one Playwright execution.

## 🎯 Motivation

When a Playwright run fails, developers usually:

- Rerun tests blindly
- Scan long logs
- Open traces manually
- Guess whether it's flaky, broken, or a selector issue

This MVP acts as a **forensic CI investigator**.

> Given a single Playwright run, it produces a structured, opinionated diagnosis and a recommended next action.

---

## 🧩 What This MVP Is (and Is Not)

### ✅ This IS

- A **decision-support tool** for failed Playwright runs
- A **Vercel AI SDK-based multi-agent system**
- Fully **local / personal-use**
- Deterministic and explainable

### ❌ This is NOT

- A SaaS (yet)
- A flaky-test detector (needs history)
- An auto-fix or code-modifying tool
- A dashboard or reporting UI

---

## 📥 Required Inputs (Single Run Only)

The system only accepts **artifacts produced by ONE Playwright run**:

- `playwright-report.json`
- `playwright-report.html` (optional)
- `context.md` (manual context you provide)
- Playwright `trace.zip`
- Screenshots (PNG/JPEG)
- Video recording (MP4/WebM)

No other data sources are used.

---

## 🧠 Agent Architecture (Vercel AI SDK)

The MVP is composed of **five specialized agents**, each with a single responsibility.

### 1️⃣ Report Decomposition Agent (Entry Point)

**Purpose**
Convert raw Playwright artifacts into structured, machine-readable facts.

**Inputs**

- Playwright JSON report
- Error messages
- Stack traces
- Test metadata

**Outputs**

```json
{
  "test_name": "login should succeed",
  "file": "tests/login.spec.ts",
  "failed_step": "click login",
  "error": "waiting for selector...",
  "timeout": 30000
}
```

This agent establishes **ground truth** for all downstream reasoning.

---

### 2️⃣ Failure Classification Agent

**Purpose**
Determine the _type_ of failure without any historical data.

**Classifications**

- Selector not found
- Element detached
- Timeout
- Assertion mismatch
- Navigation failure
- Authentication / session issue
- Test bug vs application bug

**Output**

```json
{
  "category": "selector_not_found",
  "confidence": 0.82,
  "reasoning": "locator.waitFor timed out on data-testid selector"
}
```

---

### 3️⃣ Artifact Correlation Agent (Trace + Media)

**Purpose**
Correlate what the test _expected_ with what the browser _actually showed_.

**Inputs**

- Playwright trace
- Screenshots
- Video recording

**Signals Detected**

- Page fully loaded vs blocked
- Missing or hidden elements
- Unexpected modals or banners
- Redirects or auth failures

**Output**

```json
{
  "uiState": "element missing",
  "pageState": "loaded",
  "blockingFactors": ["cookie_banner", "modal overlay"]
}
```

**Implementation**

- Extracts DOM snapshots from Playwright traces at failure point
- Analyzes screenshots using GPT-4o vision API
- Detects page lifecycle events (load, navigation, redirects)
- Identifies blocking elements (modals, banners, overlays, spinners)
- Correlates test expectations with actual UI state

---

### 4️⃣ Selector Heuristics Agent (Stateless Drift Detection)

**Purpose**
Evaluate selector quality and suggest more resilient alternatives **without comparing to past runs**.

**Heuristics Used**

- CSS vs semantic selectors
- Deep DOM nesting
- Text-based selectors on dynamic content
- Non-unique locators

**Output**

```json
{
  "selector_quality": "fragile",
  "suggested_selector": "getByRole('button', { name: 'Login' })",
  "confidence": 0.74
}
```

---

### 5️⃣ Action Synthesis Agent (Final Verdict)

**Purpose**
Produce a clear, human-readable decision and next step.

**Decisions**

- Retry vs fix
- Test issue vs app issue
- Selector change vs timing vs environment
- Priority level

**Output**

```json
{
  "verdict": "test_issue",
  "recommended_action": "update selector",
  "urgency": "medium",
  "reason": "element missing but page loaded with no app errors"
}
```

---

## 🔁 Execution Flow

```text
Playwright artifacts
        ↓
Report Decomposition Agent ✅
        ↓
Failure Classification Agent ✅
        ↓
Artifact Correlation Agent ✅
        ↓
Selector Heuristics Agent (conditional) ⏳
        ↓
Action Synthesis Agent ⏳
```

Agents are **conditionally executed** — not all agents run for every failure.

---

## 🛠️ Tooling Used by Agents

Each agent operates only on local inputs using deterministic tools:

- JSON parsing
- HTML parsing
- Stack trace analysis
- DOM snapshot extraction from trace
- Screenshot inspection
- Video frame inspection (optional)

No network calls are required.

---

## 📁 Repository Structure

```text
agents/
  reportDecomposer.ts
  failureClassifier.ts
  artifactCorrelator.ts
  selectorHeuristics.ts
  actionSynthesizer.ts

tools/
  parseReport.ts
  readTrace.ts
  extractDOM.ts
  analyzeScreenshot.ts
  detectPageLifecycle.ts

pipeline/
  runAnalysis.ts

types/
  schemas.ts

examples/
  playwright-report.json
  error-context.md

README.md
```

---

## 🚀 How to Use (Conceptual)

1. Run Playwright tests with trace, video, and screenshots enabled
2. Collect the artifacts
3. Provide optional context in `context.md`
4. Execute the analysis pipeline
5. Receive a structured diagnosis and recommendation

---

## 🧠 Design Principles

- Stateless by design
- Explainable decisions
- Minimal agent count
- Clear separation of concerns
- Personal productivity first

---

## 🗺️ Roadmap: Stateless Playwright Failure Analysis MVP

### PHASE 0 — Foundations (1–2 days)

- [x] **Goal:** Make the problem concrete and reproducible.

**Deliverables**

- [x] Decide one canonical input format
  - [x] `report.json` = required
  - [x] `trace.zip` = required
  - [x] `screenshots` / `video` = optional
  - [x] `context.md` = optional
- [x] Define canonical intermediate schema
  - [x] `TestFailureFacts`
  - [x] `ArtifactSignals`
  - [x] `FinalDiagnosis`

**Why this phase matters**

If schemas drift, agents become fuzzy and untrustworthy.

**Exit criteria ✅**

You can point the system at a folder and say:

> "This is ONE Playwright run."

**Status:** ✅ **COMPLETE**

---

### PHASE 1 — Report Decomposition Agent (Core) (2–3 days)

- [x] **Goal:** Extract reliable facts from Playwright output.

**Build**

- [x] Agent: `ReportDecomposer`
- [x] Tools:
  - [x] JSON parser
  - [x] Stack trace extractor
  - [x] Step failure locator

**What it must do perfectly**

Identify:

- [x] Failed test(s)
- [x] Exact failing step
- [x] Error + timeout
- [x] File + line number

**Output**

Deterministic JSON. No opinions.

**Exit criteria ✅**

You trust this agent more than manually reading the report.

⚠️ **Do NOT add reasoning here.**

**Status:** ✅ **COMPLETE**

---

### PHASE 2 — Failure Classification Agent (2 days)

- [x] **Goal:** Name the failure type confidently using only runtime signals.

**Build**

- [x] Agent: `FailureClassifier`
- [x] Input: `TestFailureFacts`
- [x] Output: `FailureCategory`

**Categories (start small)**

- [x] `selector_not_found`
- [x] `timeout`
- [x] `assertion_failed`
- [x] `navigation_error`
- [x] `auth_error`
- [x] `unknown`

**Rules first, LLM second**

- [x] Use pattern matching before LLM reasoning
- [x] LLM only explains ambiguous cases
- [x] Confidence scoring
- [x] UI display with badges and reasoning

**Exit criteria ✅**

- You stop saying "wtf happened?"
- You start saying "ah, it's that kind of failure."

**Status:** ✅ **COMPLETE**

---

### PHASE 3 — Artifact Correlation Agent (Trace-First) (3–4 days)

- [x] **Goal:** Understand UI reality vs test expectations.

**Build**

- [x] Agent: `ArtifactCorrelator`
- [x] Tools:
  - [x] Trace DOM snapshot reader (`tools/readTrace.ts`)
  - [x] DOM extraction and analysis (`tools/extractDOM.ts`)
  - [x] Screenshot inspection (`tools/analyzeScreenshot.ts`)
  - [x] Page lifecycle events (`tools/detectPageLifecycle.ts`)

**What it answers**

- [x] Was the page loaded?
- [x] Was the element visible?
- [x] Was something blocking the UI?
- [x] Did a redirect happen?

**Exit criteria ✅**

- [x] You no longer open trace viewer by default.
- [x] You only open it when the agent tells you to.
- [x] Screenshots are displayed in the analysis UI
- [x] UI state analysis is shown with page state, blocking factors, and visual indicators

**Status:** ✅ **COMPLETE**

---

### PHASE 4 — Selector Heuristics Agent (Stateless Intelligence) (3 days)

- [ ] **Goal:** Solve the #1 Playwright pain without history.

**Build**

- [ ] Agent: `SelectorHeuristics`
- [ ] Input:
  - [ ] Failing selector
  - [ ] DOM snapshot
- [ ] Output:
  - [ ] Selector quality score
  - [ ] Suggested alternative

**Heuristics priority**

- [ ] Semantic selectors > CSS
- [ ] Role/name > text
- [ ] Stable attributes > deep nesting

**Exit criteria ✅**

You copy the suggested selector at least once and it works.

> This is a huge win moment.

**Status:** ⏳ **PENDING**

---

### PHASE 5 — Action Synthesis Agent (Decision Layer) (2 days)

- [ ] **Goal:** Turn signals into clear next steps.

**Build**

- [ ] Agent: `ActionSynthesizer`
- [ ] Inputs:
  - [ ] Failure category
  - [ ] UI signals
  - [ ] Selector analysis
- [ ] Outputs
  - [ ] Verdict: `test_issue` / `app_issue` / `unclear`
  - [ ] Action: `retry` / `fix selector` / `increase timeout` / `investigate app`
  - [ ] Urgency level

**Exit criteria ✅**

You follow the recommendation without second-guessing.

**Status:** ⏳ **PENDING**

---

### PHASE 6 — CLI + Developer UX (2–3 days)

- [ ] **Goal:** Make this feel like a real tool.

**Build**

- [ ] CLI command:
  ```bash
  npx pwsniffer ./run-artifacts
  ```
- [ ] CLI output
  - [ ] Human-readable summary
  - [ ] JSON output for scripting
  - [ ] Optional Markdown report

**Exit criteria ✅**

You actually use it after a failed run.

> If you don't use it, it failed.

**Status:** ⏳ **PENDING**

---

### PHASE 7 — Hardening & Trust (ongoing)

- [ ] **Goal:** Make it reliable, not fancy.

**Improvements**

- [x] Confidence scoring (implemented in Phase 2)
- [x] Clear "unknown" states (implemented in Phase 2)
- [x] Explainable reasoning (implemented in Phase 2)
- [ ] Fallback behavior when artifacts are missing

**Exit criteria ✅**

- It never lies confidently.
- It says "not enough info" when appropriate.

**Status:** 🚧 **PARTIALLY COMPLETE**

---

### 🚦 What NOT to build in this roadmap

❌ SaaS infra  
❌ Auth  
❌ Dashboards  
❌ Historical learning  
❌ Flaky detection  
❌ Auto-fix PRs

Those come after trust.

---

### 🧠 Mental model (important)

Think of this system as:

> A senior QA engineer looking at one failed run and giving advice

Not:

> An AI trying to be clever.

---

### Final advice (founder-to-founder)

If after Phase 4 you already feel:

> "Damn… this is actually helpful"

You're onto something real.

---

## 🔮 Future Extensions (Not in MVP)

- Historical flakiness detection
- CI cost optimization
- GitHub Action integration
- Team dashboards
- Enterprise SaaS offering

---

## 📌 Status

🚧 **MVP / Experimental**
Built for personal use to validate the agent architecture before expanding into a full TestOps intelligence platform.

---

## 🧑‍💻 Author

Built as a personal R&D project to explore **Vercel AI SDK multi-agent systems applied to Playwright failure analysis**.

If this works well statelessly, it will scale naturally once historical data is introduced.
