/**
 * Execution Budget & Loop Guard for AI Tool Calls
 * Enforces:
 * 1. Maximum tool calls per request (default: 8)
 * 2. Duplicate tool call suppression (hash/signature check)
 * 3. Loop prevention (recursive or circular tool patterns)
 * 4. Overall timeout and per-tool timeout
 */

export class ExecutionBudgetExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExecutionBudgetExceededError";
  }
}

export interface BudgetConfig {
  maxToolCalls?: number;
  overallTimeoutMs?: number;
  perToolTimeoutMs?: number;
}

export class ExecutionBudgetManager {
  private readonly maxToolCalls: number;
  private readonly overallTimeoutMs: number;
  private readonly perToolTimeoutMs: number;
  private readonly startTime: number;
  private callsMade: number = 0;
  private executedSignatures: Set<string> = new Set();
  private callHistory: { toolName: string; timestamp: number }[] = [];

  constructor(config?: BudgetConfig) {
    this.maxToolCalls = config?.maxToolCalls ?? 8;
    this.overallTimeoutMs = config?.overallTimeoutMs ?? 15_000;
    this.perToolTimeoutMs = config?.perToolTimeoutMs ?? 4_000;
    this.startTime = Date.now();
  }

  get remainingCalls(): number {
    return Math.max(0, this.maxToolCalls - this.callsMade);
  }

  get totalCallsMade(): number {
    return this.callsMade;
  }

  get elapsedMs(): number {
    return Date.now() - this.startTime;
  }

  /**
   * Generates a deterministic signature for a tool invocation to prevent duplicate execution.
   */
  private computeSignature(toolName: string, args: Record<string, any>): string {
    // Sort keys for deterministic representation
    const sortedArgs: Record<string, any> = {};
    for (const key of Object.keys(args).sort()) {
      sortedArgs[key] = args[key];
    }
    return `${toolName}:${JSON.stringify(sortedArgs)}`;
  }

  /**
   * Validates if a tool call can proceed within budget and without looping.
   */
  checkCanExecute(toolName: string, args: Record<string, any>): { allowed: boolean; reason?: string } {
    // 1. Check max calls
    if (this.callsMade >= this.maxToolCalls) {
      return {
        allowed: false,
        reason: `Execution budget depleted: maximum of ${this.maxToolCalls} tool calls reached.`,
      };
    }

    // 2. Check overall timeout
    if (Date.now() - this.startTime >= this.overallTimeoutMs) {
      return {
        allowed: false,
        reason: `Execution budget depleted: overall timeout of ${this.overallTimeoutMs}ms exceeded.`,
      };
    }

    // 3. Check duplicate invocation
    const sig = this.computeSignature(toolName, args);
    if (this.executedSignatures.has(sig)) {
      return {
        allowed: false,
        reason: `Duplicate tool call suppressed: '${toolName}' was already executed with identical arguments.`,
      };
    }

    // 4. Check rapid loop (more than 3 consecutive calls of the exact same tool)
    const recent = this.callHistory.slice(-3);
    if (recent.length === 3 && recent.every((h) => h.toolName === toolName)) {
      return {
        allowed: false,
        reason: `Infinite loop guard: tool '${toolName}' executed 3 times consecutively. Halting repetition.`,
      };
    }

    return { allowed: true };
  }

  /**
   * Records that a tool call was executed.
   */
  recordCall(toolName: string, args: Record<string, any>): void {
    const check = this.checkCanExecute(toolName, args);
    if (!check.allowed) {
      throw new ExecutionBudgetExceededError(check.reason || "Budget exceeded");
    }

    const sig = this.computeSignature(toolName, args);
    this.executedSignatures.add(sig);
    this.callsMade += 1;
    this.callHistory.push({ toolName, timestamp: Date.now() });
  }

  getPerToolTimeoutMs(): number {
    return this.perToolTimeoutMs;
  }
}
