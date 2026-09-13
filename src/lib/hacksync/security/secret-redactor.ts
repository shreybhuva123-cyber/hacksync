/**
 * Secret Redactor Engine
 * Automatically scans and masks sensitive tokens, private keys, database credentials,
 * and API keys before sending prompts to external LLMs or displaying in audit logs.
 */

export interface SecretDetection {
  patternName: string;
  category: "api_key" | "database" | "jwt" | "cloud" | "private_key" | "credential";
  severity: "critical" | "high";
  line?: number | undefined;
}

const REDACTION_PATTERNS: {
  name: string;
  category: SecretDetection["category"];
  severity: SecretDetection["severity"];
  regex: RegExp;
  mask: string;
}[] = [
  // AWS Access Key
  {
    name: "AWS Access Key",
    category: "cloud",
    severity: "critical",
    regex: /(?:AKIA|ABIA|ACCA|ASIA)[0-9A-Z]{16}/g,
    mask: "[REDACTED_AWS_KEY]",
  },
  // Stripe Live Secret Key
  {
    name: "Stripe Live Secret Key",
    category: "api_key",
    severity: "critical",
    regex: /(?:sk_live_|pk_live_)[0-9a-zA-Z]{24,}/g,
    mask: "[REDACTED_STRIPE_KEY]",
  },
  // Google Cloud / Gemini API Key
  {
    name: "Google API Key",
    category: "api_key",
    severity: "high",
    regex: /AIza[0-9A-Za-z\-_]{20,50}/g,
    mask: "[REDACTED_GOOGLE_KEY]",
  },
  // Anthropic API Key
  {
    name: "Anthropic API Key",
    category: "api_key",
    severity: "critical",
    regex: /sk-ant-(?:api)?[0-9a-zA-Z_-]{10,}/g,
    mask: "[REDACTED_ANTHROPIC_KEY]",
  },
  // OpenAI API Key
  {
    name: "OpenAI API Key",
    category: "api_key",
    severity: "critical",
    regex: /sk-(?!ant-)(?:proj-)?[a-zA-Z0-9_-]{20,}/g,
    mask: "[REDACTED_OPENAI_KEY]",
  },
  // GitHub Personal Access Token
  {
    name: "GitHub Token",
    category: "api_key",
    severity: "critical",
    regex: /(?:ghp_[a-zA-Z0-9]{36}|github_pat_[a-zA-Z0-9_]{82})/g,
    mask: "[REDACTED_GITHUB_TOKEN]",
  },
  // Supabase Service Role Key
  {
    name: "Supabase Service Role Key",
    category: "jwt",
    severity: "critical",
    regex: /sb_secret_[a-zA-Z0-9_\-]{20,}/g,
    mask: "[REDACTED_SUPABASE_SECRET]",
  },
  // Bearer Token in Headers / Auth String
  {
    name: "Bearer Token",
    category: "jwt",
    severity: "high",
    regex: /Bearer\s+([a-zA-Z0-9\-._~+/]+=*)/gi,
    mask: "Bearer [REDACTED_BEARER_TOKEN]",
  },
  // Database Connection URL with Password
  {
    name: "Database Connection String with Credentials",
    category: "database",
    severity: "critical",
    regex: /postgres(?:ql)?:\/\/([^:]+):([^@]+)@([^/:]+)(?::\d+)?\/([^\s"']+)/g,
    mask: "postgresql://$1:[REDACTED_DB_PASSWORD]@$3/$4",
  },
  // RSA / SSH Private Key Header
  {
    name: "Private Key Header",
    category: "private_key",
    severity: "critical",
    regex: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g,
    mask: "[REDACTED_PRIVATE_KEY_BLOCK]",
  },
  // Generic Hardcoded Secrets in Config or Code (e.g., jwt_secret = "...", password = "...")
  {
    name: "Hardcoded Credential Assignment",
    category: "credential",
    severity: "high",
    regex: /(["']?(?:password|passwd|jwt_secret|jwtSecret|api_key|apiKey|client_secret|clientSecret|auth_token|authToken)["']?\s*[:=]\s*["'])([^"']{6,})(["'])/gi,
    mask: "$1[REDACTED_SECRET]$3",
  },
  // Environment File / Unquoted Credential Assignment (e.g., JWT_SECRET=..., API_KEY=..., DATABASE_PASSWORD=...)
  {
    name: "Environment File Credential",
    category: "credential",
    severity: "critical",
    regex: /(^[A-Z0-9_]*(?:SECRET|KEY|PASSWORD|PASSWD|TOKEN|AUTH|CREDENTIAL|PRIVATE)[A-Z0-9_]*\s*=\s*)(["']?)([^"'\r\n\s]{6,})(\2)/gim,
    mask: "$1$2[REDACTED_ENV_SECRET]$2",
  },
];

export class SecretRedactor {
  /**
   * Scans text and replaces any detected secrets with their safe redacted placeholder.
   */
  static redact(content: string): {
    redactedText: string;
    detections: SecretDetection[];
  } {
    if (!content) return { redactedText: "", detections: [] };

    let redactedText = content;
    const detections: SecretDetection[] = [];

    for (const p of REDACTION_PATTERNS) {
      p.regex.lastIndex = 0;
      if (p.regex.test(redactedText)) {
        detections.push({
          patternName: p.name,
          category: p.category,
          severity: p.severity,
        });

        p.regex.lastIndex = 0;
        redactedText = redactedText.replace(p.regex, p.mask);
      }
      p.regex.lastIndex = 0;
    }

    return { redactedText, detections };
  }

  /**
   * Fast boolean check whether content contains potential raw credentials.
   */
  static containsPotentialSecret(content: string): boolean {
    if (!content) return false;
    for (const p of REDACTION_PATTERNS) {
      p.regex.lastIndex = 0;
      if (p.regex.test(content)) {
        p.regex.lastIndex = 0;
        return true;
      }
      p.regex.lastIndex = 0;
    }
    return false;
  }
}
