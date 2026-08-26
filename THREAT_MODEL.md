# HackSync — STRIDE Threat Model & Security Architecture

## 1. System Overview & Trust Boundaries

```
[Untrusted Client / Browser]
          │
    (1) HTTPS / TLS 1.3 + CSP + HSTS
          ▼
[Edge / CDN / Nitro Server]
          │
    (2) Supabase Auth (JWT ES256)
          ▼
[PostgreSQL Database (Supabase)]
    ├── Row Level Security (RLS)
    └── Security Definer RPCs
          │
    (3) Outbound External APIs (Sanitized Payload / Key Isolation)
          ▼
[AI Model Providers (OpenAI / Anthropic / Google Gemini)]
```

### Primary Assets
1. **Source Code & AST Data**: Local file metadata, code nodes, git branches.
2. **API Contracts & Schemas**: Single source of truth contracts and database migration definitions.
3. **User Identities & JWTs**: Authentication tokens, member role assignments, email addresses.
4. **Project Access Control**: Multi-tenant workspace isolation.

---

## 2. STRIDE Threat Analysis & Mitigations

### 1. Spoofing (Identity & Authentication)
- **Threat**: Attacker creates fake JWTs or replays expired authentication tokens.
- **Mitigation**:
  - Supabase Auth verifies asymmetric JWT signatures (`ES256`).
  - Strict token expiry checks with automated refresh rotation.
  - Route guards on all 9 authenticated routes redirect unauthenticated callers to `/auth`.

### 2. Tampering (Data Integrity & Role Escalation)
- **Threat**: A regular team member issues an `UPDATE project_members SET role = 'owner'` to elevate privileges.
- **Mitigation**:
  - Removed `auth.uid() = user_id` from table-level RLS update policies.
  - Role modifications require PostgreSQL Security Definer RPC `change_member_role` verifying `can_manage_members(project_id)`.
  - Client service [`members.service.ts`](file:///d:/shrey/hacksync-project/src/lib/services/members.service.ts) throws `AuthorizationError` on client-side escalation attempts.

### 3. Repudiation (Audit & Traceability)
- **Threat**: Malicious actor deletes critical contracts or tables and claims system error.
- **Mitigation**:
  - Structured Security Audit Logger ([`audit-logger.ts`](file:///d:/shrey/hacksync-project/src/lib/security/audit-logger.ts)) records all role changes, contract locks, and deletions with actor UUID, action, and timestamp.
  - Realtime `activity_events` stream logs chronological workspace milestones.

### 4. Information Disclosure (Confidentiality & Multi-Tenancy)
- **Threat**: User in Project A guesses or discovers Project B's UUID and queries its contracts or schema.
- **Mitigation**:
  - PostgreSQL Row Level Security (RLS) enabled on all 12 tables.
  - Every `SELECT`, `INSERT`, `UPDATE`, `DELETE` policy evaluates `public.can_view_project(project_id)`.
  - Unauthenticated access to private projects returns zero rows.

### 5. Denial of Service (Availability & Rate Limiting)
- **Threat**: Automated attacker spams auth endpoints with brute-force passwords or floods AI queries to exhaust API quotas.
- **Mitigation**:
  - Distributed Sliding-Window Rate Limiter ([`rate-limiter.ts`](file:///d:/shrey/hacksync-project/src/lib/security/rate-limiter.ts)).
  - Auth brute-force limit: 5 requests per 60 seconds per IP/email.
  - AI assistant query limit: 20 queries per 60 seconds.

### 6. Elevation of Privilege (Authorization Boundaries)
- **Threat**: Frontend engineer modifies database migration scripts or unlocks frozen API contracts.
- **Mitigation**:
  - Role-Based Access Control matrix (`owner`, `lead`, `backend`, `database`, `frontend`, `member`).
  - DB schema modifications restricted to `owner`, `lead`, `database`.
  - API contract modifications restricted to `owner`, `lead`, `backend`.

---

## 3. Automated Security Regression Test Matrix

All mitigations are enforced through automated tests in [`src/lib/services/__tests__/security-authorization.test.ts`](file:///d:/shrey/hacksync-project/src/lib/services/__tests__/security-authorization.test.ts):
- ✅ `Unauthenticated user -> Blocked from all mutations`
- ✅ `Member -> Cannot promote self to lead or owner`
- ✅ `Frontend role -> Cannot modify DB schema`
- ✅ `Backend role -> Cannot modify DB schema`
- ✅ `User in Project A -> Cannot access or mutate Project B`
- ✅ `Rate Limiter -> Throttles brute force requests after threshold`
