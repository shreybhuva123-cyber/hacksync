/**
 * Core Type Definitions for HackSync AI Orchestration System
 */

export type AIIntentType =
  | "debug"
  | "security"
  | "testing"
  | "fix"
  | "architecture"
  | "git"
  | "general";

export type FindingSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";

export interface EvidenceItem {
  id: string;
  filePath: string;
  line: number;
  snippet: string;
  category: string;
  reason: string;
  callChain?: string[] | undefined;
  severity: FindingSeverity;
  confidence: number; // 0..100
}

export interface AIFinding {
  id: string;
  title: string;
  severity: FindingSeverity;
  confidence: number; // 0..100
  evidenceCount: number;
  primaryLocation: {
    filePath: string;
    line: number;
  };
  evidenceItems: EvidenceItem[];
  explanation: string;
  impact: string;
  recommendedFix: string;
  suggestedPatch?: string | undefined;
}

export interface ToolDefinition {
  name: string;
  description: string;
  tier: "READ_ONLY" | "MUTATING";
  parameters: Record<string, { type: string; description: string; required?: boolean }>;
}

export interface ToolCallRequest {
  id: string;
  name: string;
  arguments: Record<string, any>;
}

export interface ToolCallResult {
  toolName: string;
  success: boolean;
  data: any;
  error?: string | undefined;
  executionMs: number;
  requiresApproval?: boolean | undefined;
  approvalId?: string | undefined;
}

export interface ConversationState {
  activeBugId?: string | undefined;
  activeFilePath?: string | undefined;
  activeIntent?: AIIntentType | undefined;
  lastFixPlan?: string | undefined;
  lastPatchDiff?: string | undefined;
  lastTestReport?: string | undefined;
  recentEntities: string[];
}
