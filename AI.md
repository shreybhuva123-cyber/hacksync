# AI Subsystem Architecture

The HackSync AI subsystem is designed to provide intelligent assistance while maintaining strict security boundaries and requiring human oversight for mutating actions.

## Core Components

### AI Gateway
Located in `src/lib/ai/ai-gateway.ts`, the AI Gateway is responsible for:
- Server-side API key management (never exposed to clients).
- Tenant verification to ensure AI requests operate within isolated project contexts.
- Secret redaction before any context is dispatched to LLM providers.

### Tool Registry
The AI interacts with the system via a controlled tool registry (`src/lib/hacksync/ai/tool-registry.ts`).
- Tools are categorized as `READ_ONLY` or require explicit user approval.
- Currently, 12 discrete AI tools are implemented in `src/lib/hacksync/ai/tools/`.

### Approval Gate
All state-mutating actions proposed by the AI must pass through the Approval Gate (`src/lib/hacksync/ai/approval-gate.ts`).
- **Database-Authoritative**: Approvals are tracked securely in the database (`ai_approval_requests` table).
- **Atomic Consumption**: Approvals are consumed atomically to prevent race conditions or double execution.

## Execution and Reasoning

### Orchestrator
The Orchestrator manages context planning and task decomposition.

### Evidence-First Reasoning
The AI employs an evidence-first reasoning model. It grounds its assertions in specific file paths, line numbers, and symbol references, ensuring actionable and verifiable outputs.

### Circular Evaluation Detection
Built-in mechanisms detect and break circular evaluation loops, preventing infinite reasoning cycles during complex analysis tasks.

## Capabilities and Terminology
We use honest terminology to describe the AI's capabilities. It performs **"evidence-based static security analysis"** rather than claiming "complete SAST". It is an assistive tool intended to augment, not replace, formal security analysis.
