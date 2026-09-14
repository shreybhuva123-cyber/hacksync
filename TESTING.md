# Testing Strategy

HackSync employs a comprehensive, multi-layered testing strategy to ensure reliability, security, and correct behavior of its synchronization and AI components.

## Overview
- **Metrics**: 504 tests, 2,359 assertions across 48 test files.
- **Runner**: Bun test framework.

## Validation Gates
The CI pipeline enforces 7 distinct validation gates:
1. TypeScript compilation
2. Core unit tests
3. Integration tests
4. Security tests
5. Evaluation tests
6. Performance tests
7. Build verification

## Test Categories
Testing is partitioned into specific categories to isolate concerns:
- Unit, Integration, Security, Adversarial, Evaluation, Validation, Concurrency, Performance.

## Key Test Suites
Our testing rigor focuses heavily on edge cases and security boundaries:
- `auth-hardening`: Validates RLS and authorization logic.
- `approval-gate-attacks`: Ensures atomic consumption and prevents replay.
- `tool-abuse`: Tests boundaries of AI tool execution.
- `project-isolation`: Verifies multi-tenant data isolation.
- `path-traversal`: Guards against malicious path inputs in syncing.
- `prompt-injection`: Tests AI subsystem resilience.
- `codesync-state-machine`: Validates deterministic state transitions.
- `smart-merge-engine`: Tests conflict resolution scenarios.
- `real-repo-validation`: End-to-end sync testing.

## Test Environment Setup
Tests utilize `registerTestMembership` to quickly provision tenant fixtures securely.
We utilize an isolated test workspace for patch and file system testing, avoiding the overhead of a full VM sandbox while maintaining functional isolation.
