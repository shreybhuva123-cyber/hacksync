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
    regex: /AIza[0-9A-Za-z\-_]{30,45}/g,
    mask: "[REDACTED_GOOGLE_KEY]",
  },
  // OpenAI API Key
  {
    name: "OpenAI API Key",
    category: "api_key",
    severity: "critical",
    regex: /sk-(?:proj-)?[a-zA-Z0-9_-]{32,}/g,
    mask: "[REDACTED_OPENAI_KEY]",
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
      // Test if pattern exists
      if (p.regex.test(redactedText)) {
        detections.push({
          patternName: p.name,
          category: p.category,
          severity: p.severity,
        });

        // Replace all occurrences
        redactedText = redactedText.replace(p.regex, p.mask);
      }
      // Reset regex state after test/replace
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
        return true;
      }
    }
    return false;
  }
}
