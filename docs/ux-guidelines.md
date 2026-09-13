# HackSync — Phase 7: UX & Interaction Guidelines

**Document Status:** Production Baseline  
**Phase:** 7 — Complete Productization + Professional UI/UX Redesign  
**Theme:** Developer-Centric, Evidence-Driven Control Platform

---

## 1. UX Philosophy & Core Principles

HackSync is designed around a singular interaction premise: **Engineers do not trust "magic" — they trust verifiable evidence, predictable controls, and reversible changes.**

The user experience adheres to five foundational guidelines:
1. **Evidence Precedes Action**: Never show a recommendation or remediation proposal without citing exact code locations, AST symbols, CWE classifications, and diff previews.
2. **Strict Human-in-the-Loop Fix Gate**: No AI agent or automated process may silently modify or push code. Every fix must be inspected in a unified diff and approved by the developer.
3. **High Density Without Clutter**: Maximize information per square inch through tabular layouts, monospace formatting, and collapsible detail panels without overwhelming whitespace.
4. **Deterministic Feedback**: Operations (such as test runs, security scans, and benchmark runs) provide clear progress indicators, execution duration, and reproducible SHA-256 hashes.
5. **Calm Ergonomics**: Dark neutral palette with high-contrast text, eliminating distracting animated gradients, glowing borders, and marketing-style hero banners.

---

## 2. Human-in-the-Loop Fix & Remediation Workflow

Remediations follow a strict multi-step lifecycle:

```
[SAST Finding / Test Failure]
             |
             v
   1. Inspect Evidence (Location, CWE, Impact, AST Node)
             |
             v
   2. "Propose Fix & Review Diff" Action
             |
             v
   3. ApprovalGate Dialog Opens
        - Root Cause & Target File
        - Unified Diff Inspection (DiffViewer)
        - Regression Risk Assessment
        - Verifiable SHA-256 Base & Diff Hashes
             |
       +-----+-----+
       |           |
    [Reject]   [Approve & Apply]
       |           |
    Dismissed      v
             4. Phase 4 Sandbox Verification Loop
                  - Apply in memory
                  - Run targeted regression tests
                  - Verify fix passes
             |
             v
   5. Success State & Audit Trail Logged
```

### 2.1 Approval Gate Constraints
- The modal cannot be accidentally dismissed during active patch application.
- The unified diff highlights exact lines added (green) and removed (red).
- The approving developer's action is recorded in the immutable `activity_events` audit trail.

---

## 3. Evidence Presentation Standards

All intelligence surfaces must adhere to standardized display tokens:
- **File Paths**: Displayed in monospace (`mono text-xs`), truncated at the root with full path on hover tooltip.
- **AST Symbols**: Prefixed with type pill (`fn`, `class`, `type`) and highlighted in primary accent blue (`#4F8CFF`).
- **Cryptographic Hashes**: Always formatted with JetBrains Mono, truncated to 8 characters with full copy action (e.g., `ca978112...`).
- **Severity Ratings**:
  - `CRITICAL` / `HIGH`: Rose badge with danger tone (`#EF4444`).
  - `MEDIUM` / `LOW`: Amber badge with warning tone (`#F59E0B`).
  - `INFO`: Sky blue badge with info tone (`#38BDF8`).
  - `PASSING`: Emerald badge with success tone (`#22C55E`).

---

## 4. State Transitions & Feedback

### 4.1 Loading States
- Never use full-screen blank spinners.
- Use bone-structured animated skeletons that match the exact shape and layout of target panels (`h-4 bg-border/50 animate-pulse rounded-[4px]`).
- For long-running operations (benchmark suite execution, test sandbox runs), provide an elapsed timer and active step label.

### 4.2 Empty States
- When a workspace contains zero records (e.g., no tests planned, no vulnerabilities detected), render a clean panel with:
  - An icon in muted neutral color.
  - A concise descriptive heading (e.g., "No active security vulnerabilities").
  - An explanation and a primary action button (e.g., "Trigger Manual SAST Scan").

### 4.3 Error Handling
- Network or database failures are captured by error boundaries and displayed with:
  - Amber/Rose status badge.
  - Technical error message in monospace.
  - One-click "Retry Action" button.

---

## 5. Keyboard Navigation & Shortcuts

HackSync is built for keyboard-first developers:
- `Ctrl + K` or `Cmd + K`: Opens global **Command Palette** from anywhere in the application.
- `Ctrl + B` or `Cmd + B`: Toggles the navigation sidebar between expanded and collapsed modes.
- `Esc`: Closes any open modal (ApprovalGate, CommandPalette, Copilot drawer).
- `Tab` / `Shift + Tab`: Predictable sequential focus order through all form controls and buttons.
- `Enter`: Selects the highlighted item in Command Palette or confirms modal primary action.
