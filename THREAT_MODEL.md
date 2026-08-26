# HackSync — STRIDE Threat Model & Security Architecture

## 1. System Overview & Trust Boundaries

```
[Untrusted Client / Browser]
          │
    (1) HTTPS / TLS 1.3 + CSP (no unsafe-eval; uses unsafe-inline) + HSTS + X-Frame-Options: DENY
          ▼
[Edge / CDN / Nitro Server Middleware]
    ├── Response Security Headers Injector
    └── Distributed Upstash Redis Rate Limiting (Pipeline: ZREMRANGEBYSCORE + ZCARD + ZADD + EXPIRE)
          │
    (2) Supabase Auth (JWT ES256)
          ▼
[PostgreSQL Database (Supabase)]
    ├── Row Level Security (RLS) on all tables
    ├── Immutable security_audit_events table (Append-Only)
    ├── Token-based project_invitations table
    └── Security Definer RPCs (change_member_role, join_project_by_invite, etc.)
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
5. **Security Audit Trails**: Immutable audit log of administrative and privilege changes.

---

## 2. STRIDE Threat Analysis & Mitigations

### 1. Spoofing (Identity & Authentication)
- **Threat**: Attacker creates fake JWTs, replays expired tokens, or attempts brute-force credential stuffing.
- **Mitigation**:
  - Supabase Auth verifies asymmetric JWT signatures (`ES256`).
  - Strict token expiry checks with automated refresh rotation.
  - Route guards on all 9 authenticated routes redirect unauthenticated callers to `/auth`.
  - Distributed `authBruteForceLimiter` throttles failed logins (5 attempts per 60 seconds per IP/email).

### 2. Tampering (Data Integrity & Role Escalation)
- **Threat**: A regular team member issues an `UPDATE project_members SET role = 'owner'` to elevate privileges, or a team lead promotes a user to owner without owner approval.
- **Mitigation**:
  - Removed `auth.uid() = user_id` from table-level RLS update policies.
  - Role modifications strictly require PostgreSQL Security Definer RPC `change_member_role`.
  - **Strict Hierarchy Check**: An `owner` can assign any role; a `lead` can ONLY assign `lead`, `backend`, `database`, `frontend`, `member` and CANNOT assign `owner` or demote existing owners.
  - Self-role modification is completely blocked at both RPC and domain service layers.

### 3. Repudiation (Audit & Traceability)
- **Threat**: Malicious actor modifies roles, locks contracts, or deletes resources and claims system error.
- **Mitigation**:
  - PostgreSQL table `public.security_audit_events` stores immutable, append-only records of all security actions.
  - Direct `UPDATE` and `DELETE` queries on `security_audit_events` are prohibited by RLS.
  - Stored procedures automatically log role changes with previous role, new role, actor UUID, and timestamp.

### 4. Information Disclosure (Confidentiality & Multi-Tenancy)
- **Threat**: User in Project A discovers Project B's UUID and queries its contracts or schema, or self-joins Project B.
- **Mitigation**:
  - Row Level Security (RLS) enabled across all database tables.
  - Every `SELECT`, `UPDATE`, `DELETE` policy evaluates `public.can_view_project(project_id)` or `public.can_edit_project(project_id)`.
  - **Invitation-Only Membership**: ALL self-insertion policies (`OR auth.uid() = user_id`) permanently removed from `project_members` INSERT, UPDATE, and DELETE operations. Joining requires either project manager invitation, valid token via `join_project_by_invite`, or invite code via `join_project_by_code` RPC.

### 5. Denial of Service (Availability & Rate Limiting)
- **Threat**: Automated attacker floods AI endpoints or mutation APIs across multiple server instances.
- **Mitigation**:
  - Distributed sliding-window rate limiter ([`rate-limiter.ts`](file:///d:/shrey/hacksync-project/src/lib/security/rate-limiter.ts)) backed by Upstash Redis REST API using atomic sorted sets (`ZREMRANGEBYSCORE`, `ZCARD`, `ZADD`, `EXPIRE`).
  - Graceful sliding-window fallback when Redis credentials are not configured.
  - Rate limits: 5 auth attempts/min, 20 AI queries/min, 100 API mutations/min.

### 6. Elevation of Privilege (Authorization Boundaries)
- **Threat**: Specialist roles (frontend, backend, database) modify out-of-scope resources.
- **Mitigation**:
  - Role-Based Access Control matrix (`owner`, `lead`, `backend`, `database`, `frontend`, `member`).
  - DB schema modifications restricted to `owner`, `lead`, `database`.
  - API contract modifications restricted to `owner`, `lead`, `backend`.

---

## 3. Automated Security Regression Test Matrix

All mitigations are enforced through automated tests in [`src/lib/services/__tests__/security-authorization.test.ts`](file:///d:/shrey/hacksync-project/src/lib/services/__tests__/security-authorization.test.ts) and [`src/lib/services/__tests__/real-database-rls.test.ts`](file:///d:/shrey/hacksync-project/src/lib/services/__tests__/real-database-rls.test.ts):
- ✅ `Unauthenticated user -> Blocked from all mutations`
- ✅ `Member -> Cannot promote self to lead or owner`
- ✅ `Lead -> Cannot promote target to owner or modify owner`
- ✅ `Frontend role -> Cannot modify DB schema or API contracts`
- ✅ `Backend role -> Cannot modify DB schema`
- ✅ `User in Project A -> Cannot access or mutate Project B`
- ✅ `Rate Limiter -> Throttles brute force requests after threshold`
