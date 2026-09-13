# HackSync — Engineering Intelligence & Integration Control Plane

[![Build & Validation](https://img.shields.io/badge/Validation-Passing-emerald)](scripts/validate.ts)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0_Strict-blue)](https://www.typescriptlang.org/)
[![Database](https://img.shields.io/badge/PostgreSQL-Row_Level_Security-emerald)](https://supabase.com/)
[![Test Suite](https://img.shields.io/badge/Tests-484_Passing-success)](#-automated-validation-suite)
[![Security Policy](https://img.shields.io/badge/Security-Strict_Read--Only-purple)](SECURITY.md)

> **Real Codebase Intelligence. Evidence-First Security. Human-Approved Fixes.**
> 
> HackSync is a developer-focused, multi-tenant engineering intelligence platform for collaborative software teams. It provides AST-level repository indexing, passive static security analysis (SAST), git impact blast radius calculation, and a deterministic Fix-Test-Verify pipeline with mandatory human authorization.

---

## 🧭 What HackSync Is (and What It Is NOT)

| HackSync IS | HackSync is NOT |
|---|---|
| ✅ **A Deterministic Control Plane** with verified evidence | ❌ An autonomous AI agent running arbitrary shell commands |
| ✅ **Strictly Read-Only AI Tools** with human approval gates | ❌ An unattended bot that autonomously pushes or commits code |
| ✅ **An Internal Heuristic Static Analyzer** for fast feedback | ❌ A replacement for certified enterprise security compliance scanners |
| ✅ **An Isolated Process-Level Test Runner** (`shell: false`) | ❌ A full hypervisor or kernel-level container sandbox |
| ✅ **Multi-Tenant with PostgreSQL RLS** and token-bucket limits | ❌ A shared-memory prototype vulnerable to cross-project leaks |

---

## 🏛️ System Topology

```
Real Repository
      ↓
Project Intelligence (Multi-Language AST + Symbol Index + BM25)
      ↓
Evidence Gathering & Context Builder (Token-Budget Compliant)
      ↓
AI Orchestrator (Multi-Provider Fallback + Circuit Breaker)
      ↓
Security Static Analysis / Git Impact / Test Planning
      ↓
Human Decision / Approval Gate (SHA-256 Unified Diff Hash)
      ↓
Fix Application (Transactional with Atomic Rollback)
      ↓
Targeted Test Run (Isolated Workspace) → Security Re-Scan
      ↓
Immutable Audit Trail (PostgreSQL Append-Only)
      ↓
Developer UI (Accessible, Dark/Light, Production-Grade)
```

---

## ⚡ Master Validation Command

To run the complete production validation harness (TypeScript check, unit tests, integration tests, adversarial security tests, evaluation benchmarks, real-repo scaling, and production build):

```bash
bun run validate
# or
npm run validate
```

### Validation Output
```
╔══════════════════════════════╗
║     HACKSYNC VALIDATION      ║
╠══════════════════════════════╣
║ TypeScript        PASS       ║
║ Unit Tests        PASS       ║
║ Integration       PASS       ║
║ Security          PASS       ║
║ Evaluation        PASS       ║
║ Performance       PASS       ║
║ Build             PASS       ║
╚══════════════════════════════╝

✅ ALL VALIDATION GATES PASSED: System ready for production.
```

---

## 📊 Evaluation & Benchmark Highlights

All benchmarks are measured against deterministic ground-truth repository fixtures. See [EVALUATION.md](EVALUATION.md) for complete details.

### 1. Hybrid Retrieval Quality
- **Small Repo (30 files)**: **Hit@1: 60.0%** | **Hit@3: 100.0%** | **Hit@5: 100.0%** | **MRR: 0.800**
- **Medium SaaS (150 files)**: **Hit@3: 100.0%** | **Hit@5: 100.0%** | **MRR: 0.542**
- **Large Monolith (520+ files)**: **Hit@5: 66.7%** | **MRR: 0.667**

### 2. Static Security Analysis (OWASP Test Suite)
- **Precision**: **100.0%** (Zero false alarms on parameterized negative controls)
- **Recall**: **83.3%** (High coverage across SQLi, Command Injection, Path Traversal, Secrets, CORS)
- **F1 Score**: **90.9%** (Realistic, defensible harmonic balance without claiming 100% false perfection)

---

## 🎬 End-to-End Demonstration Scenario

A complete 13-stage portfolio demonstration showing the entire lifecycle on a repository containing a known vulnerability is documented in [docs/demo-scenario.md](docs/demo-scenario.md):

1. Repository setup with known SQL injection.
2. AST indexing and dependency tree mapping.
3. Passive SAST audit flags line-level evidence.
4. AI Copilot returns response with verified citations.
5. Fix Proposal generates SHA-256 hashed unified diff.
6. Team lead approves the patch via Approval Gate.
7. Transactional patch application with atomic rollback safety.
8. Targeted tests execute in isolated workspace (`shell: false`).
9. Security rescan confirms vulnerability remediated.
10. Git intelligence computes regression blast radius.
11. Evaluation dashboard compares model efficiency and accuracy.
12. Immutable audit trail logs operation with `requestId`.
13. Degraded mode verification: simulated provider outage triggers deterministic fallback.

---

## 📚 Technical Documentation Index

- [ARCHITECTURE.md](ARCHITECTURE.md) — Detailed architectural topology, data flow, and components.
- [SECURITY.md](SECURITY.md) — STRIDE threat model, defense-in-depth, and RLS policies.
- [EVALUATION.md](EVALUATION.md) — Benchmark methodology, datasets, and reproducibility.
- [LIMITATIONS.md](LIMITATIONS.md) — Honest catalog of system limitations, failure conditions, and trade-offs.
- [docs/production-readiness.md](docs/production-readiness.md) — Full Phase 8 production audit and verification matrix.
- [docs/demo-scenario.md](docs/demo-scenario.md) — 13-stage walkthrough for technical reviews and presentations.

---

## 🚀 Getting Started

### Prerequisites
- [Bun](https://bun.sh/) (v1.2+) or Node.js (v20+)

### Setup
```bash
# 1. Clone repository
git clone https://github.com/shreybhuva123-cyber/hacksync.git
cd hacksync

# 2. Install dependencies
bun install

# 3. Environment setup
cp .env.example .env

# 4. Start local development server
bun dev
```

### Running Tests
```bash
# Run all unit and integration tests
bun test

# Run full production validation
bun run validate
```
