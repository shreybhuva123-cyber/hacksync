# Static Analysis Security Specification — HackSync Phase 3

## Principles of Static Security Auditing in HackSync

1. **Evidence-First**: Every finding must point to a real, verifiable source file and line number. Findings without verifiable code evidence are discarded.
2. **Decoupled Severity vs. Confidence**:
   - `severity`: Impact if exploited (`critical`, `high`, `medium`, `low`, `informational`).
   - `confidence`: Certainty of detection based on dataflow trace and pattern strength (`very_high`, `high`, `medium`, `low`).
3. **Guaranteed Secret Redaction**: Secrets must never be displayed in plaintext.
4. **Passive Audit Only**: All security tooling operates passively without generating external network traffic or payload injections.

---

## 12 Vulnerability Categories & Detection Logic

### 1. SQL Injection (`SEC-INJ-001`)
- **Pattern**: String concatenation (`+`) or template literals (`${...}`) within `db.query()`, `$queryRaw()`, `$executeRaw()`, `execute()`, or SQL query variable assignments.
- **Trace**: Untrusted input originating from `req.query`, `req.params`, or `req.body` reaching database sinks without parameterization (`$1, $2`).
- **Exclusions**: Parameterized calls with `$1` or tagged template literals (`prisma.sql`).

### 2. Code Injection / Eval (`SEC-INJ-002`)
- **Pattern**: `eval(...)`, `new Function(...)` invocations.
- **Severity**: Critical.
- **Remediation**: Use structured JSON parsing (`JSON.parse`) or declarative mapping.

### 3. Cross-Site Scripting (XSS) (`SEC-XSS-001`)
- **Pattern**: `dangerouslySetInnerHTML={{ __html: ... }}` or `.innerHTML = ...`.
- **Exclusions**: Content wrapped in sanitization routines (`DOMPurify.sanitize(...)`).

### 4. Command Injection (`SEC-CMD-001`)
- **Pattern**: Invocations of `child_process.exec`, `child_process.spawn`, `execSync` with variable concatenations.
- **Remediation**: Use `execFile` with structured, fixed argument arrays without shell interpolation.

### 5. Path Traversal (`SEC-TRAV-001`)
- **Pattern**: Direct user parameters passed to `fs.readFile`, `fs.readFileSync`, `fs.createReadStream`.
- **Remediation**: Sanitize target paths against authorized base directories using `path.resolve` and boundary checks (`startsWith(canonicalRoot)`).

### 6. Server-Side Request Forgery (SSRF) (`SEC-SSRF-001`)
- **Pattern**: `fetch(targetUrl)` or `axios.get(targetUrl)` where `targetUrl` is derived from user parameters.
- **Remediation**: Enforce protocol and domain allowlists; prohibit private IP ranges (RFC 1918, `127.0.0.1`, `169.254.169.254`).

### 7. Authentication Bypass (`SEC-AUTH-001`)
- **Pattern**: Accessing `user.password` directly without prior null validation (`if (!user) return 401;`).

### 8. Authorization (IDOR) (`SEC-AUTHZ-001`)
- **Pattern**: Deleting or updating database records by ID without scoping to tenant or authenticated `user_id`.
- **Remediation**: Always include `{ id, user_id: authUser.id }` in database mutation filters.

### 9. Insecure JWT / Session Handling (`SEC-JWT-001`)
- **Pattern**: `jwt.decode(...)` used instead of `jwt.verify(...)`, or `algorithms: ["none"]`.

### 10. Weak Cryptography (`SEC-CRYP-001`)
- **Pattern**: Password hashing with MD5 or SHA-1; session token generation using `Math.random()`.
- **Remediation**: Use Argon2id / bcrypt for passwords; `crypto.randomBytes` for security tokens.

### 11. Insecure Configuration (`SEC-CONF-001`)
- **Pattern**: `rejectUnauthorized: false` in TLS options, or wildcard CORS headers on mutating endpoints.

### 12. Insecure Database Storage (`SEC-DB-001`)
- **Pattern**: Direct assignment of `req.body.password` to database insert/update operations without hashing.
