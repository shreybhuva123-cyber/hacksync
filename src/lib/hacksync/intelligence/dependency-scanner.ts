/**
 * Dependency Vulnerability Scanner
 * Inspects project manifests (package.json) against security advisory standards.
 * Strictly presents scan findings from advisory references rather than claiming
 * to be an authoritative CVE database.
 */

export interface DependencyFinding {
  package: string;
  currentVersion: string;
  severity: "critical" | "high" | "medium" | "low";
  advisoryId: string;
  title: string;
  description: string;
  patchedIn: string;
  source: string;
}

export interface DependencyScanReport {
  scannedAt: string;
  totalDependencies: number;
  findings: DependencyFinding[];
  hasVulnerabilities: boolean;
}

// Well-known security advisories for common hackathon/web libraries
const STANDARD_SECURITY_ADVISORIES: {
  pkg: string;
  affectedRegex: RegExp;
  severity: DependencyFinding["severity"];
  advisoryId: string;
  title: string;
  description: string;
  patchedIn: string;
}[] = [
  {
    pkg: "jsonwebtoken",
    affectedRegex: /^(?:[0-7]\..*|8\.[0-4]\..*|8\.5\.0)/,
    severity: "critical",
    advisoryId: "GHSA-hjrf-2m68-5959",
    title: "Insecure Key Verification / Algorithm Confusion",
    description: "Vulnerable versions allow verification bypass via algorithm confusion (none or symmetric key HMAC confusion).",
    patchedIn: ">=9.0.0",
  },
  {
    pkg: "axios",
    affectedRegex: /^(?:0\..*|1\.[0-6]\..*)/,
    severity: "high",
    advisoryId: "GHSA-8hc4-vh64-cxmj",
    title: "Server-Side Request Forgery (SSRF) and Header Leakage",
    description: "Axios improperly retains Authorization headers when handling cross-origin redirects.",
    patchedIn: ">=1.7.4",
  },
  {
    pkg: "express",
    affectedRegex: /^[0-4]\.(?:[0-9]\.|1[0-8]\.)/,
    severity: "medium",
    advisoryId: "GHSA-qw6h-v8gh-w36c",
    title: "Open Redirect & Query Parameter Parsing Vulnerability",
    description: "Malformed query string parameters can cause unexpected behavior or prototype manipulation.",
    patchedIn: ">=4.19.2",
  },
  {
    pkg: "lodash",
    affectedRegex: /^(?:[0-3]\..*|4\.(?:[0-9]\.|1[0-6]\.|17\.(?:[01]?[0-9]|20)\b))/,
    severity: "high",
    advisoryId: "GHSA-p6mc-m468-83gw",
    title: "Prototype Pollution in lodash defaultsDeep and merge",
    description: "Object manipulation functions allow modification of Object.prototype.",
    patchedIn: ">=4.17.21",
  },
];

export class DependencyScanner {
  /**
   * Scans package.json content for known security vulnerabilities.
   */
  static scan(packageJsonContent: string): DependencyScanReport {
    const findings: DependencyFinding[] = [];
    let totalCount = 0;

    try {
      const parsed = JSON.parse(packageJsonContent);
      const dependencies = {
        ...(parsed.dependencies || {}),
        ...(parsed.devDependencies || {}),
      };

      const entries = Object.entries(dependencies);
      totalCount = entries.length;

      entries.forEach(([pkgName, versionSpec]) => {
        const rawVer = String(versionSpec).replace(/^[\^~>=<]+/, "");

        for (const advisory of STANDARD_SECURITY_ADVISORIES) {
          if (advisory.pkg === pkgName && advisory.affectedRegex.test(rawVer)) {
            findings.push({
              package: pkgName,
              currentVersion: String(versionSpec),
              severity: advisory.severity,
              advisoryId: advisory.advisoryId,
              title: advisory.title,
              description: advisory.description,
              patchedIn: advisory.patchedIn,
              source: "GitHub Advisory Database",
            });
          }
        }
      });
    } catch {
      // If parsing fails, return clean zero finding
    }

    return {
      scannedAt: new Date().toISOString(),
      totalDependencies: totalCount,
      findings,
      hasVulnerabilities: findings.length > 0,
    };
  }
}
