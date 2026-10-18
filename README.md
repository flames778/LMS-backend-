# NUTM Learn — Learning Management System Backend

Enterprise backend for **NUTM Learn**, the institutional Learning Management System (LMS) designed for the Nigerian University of Technology and Management (NUTM).

NUTM Learn provides a high-integrity, secure platform for students to access lecture materials, submit assignments, take timed assessments, and review grades; for lecturers to manage their courses, materials, tests, and marking; and for authorized IT staff to govern identity approvals, role provisioning, and institutional security policies.

---

## Architecture & Technology Stack

- **Runtime & Framework:** Node.js v24+ / Next.js (TypeScript) under `/api/v1`.
- **Identity & Authentication:** Microsoft Entra ID (OIDC / MSAL Node) restricted to the official NUTM tenant, backed by server-authoritative JWT sessions (`HttpOnly`, `Secure`, `SameSite: Lax`).
- **Authorization & Governance:** Server-side Role-Based Access Control (RBAC) with database-backed status checking (`PENDING`, `APPROVED`, `REJECTED`, `SUSPENDED`).
- **Database & Persistence:** PostgreSQL with Prisma ORM and versioned migrations.
- **Storage Layer:** Pluggable storage abstraction supporting local sandboxed filesystem storage (with strict directory traversal mitigation) and production Microsoft SharePoint Online via Microsoft Graph.
- **Testing & Quality:** Vitest test suite covering unit, integration, RBAC scoping, IDOR prevention, and concurrency controls.

---

## Directory Structure

```text
├── docs/                      # Institutional documentation suite
│   ├── architecture.md        # System architecture, trust boundaries & data flows
│   ├── database.md            # Schema, entities, relationships & indexes
│   ├── api-reference.md       # Comprehensive REST API endpoint reference
│   ├── security.md            # Threat model, RBAC policies & security controls
│   ├── deployment.md          # Environment setup, migrations & zero-downtime deploys
│   ├── microsoft-integration.md # Entra ID app registration & Graph API scopes
│   ├── backup-recovery.md     # PostgreSQL and storage recovery procedures
│   ├── incident-response.md   # Security incident handling & escalation playbooks
│   └── testing.md             # Test strategy, coverage & automated test execution
├── prisma/
│   ├── schema.prisma          # PostgreSQL relational schema definition
│   └── migrations/            # Version-controlled database migrations
├── src/
│   ├── app/
│   │   ├── api/v1/            # Standardized JSON REST API routes
│   │   │   ├── admin/         # IT Admin access requests, user management, audit
│   │   │   ├── auth/          # Entra ID signin, callback, session & me
│   │   │   ├── courses/       # Course CRUD, membership, materials, assignments
│   │   │   ├── materials/     # Material download & publication
│   │   │   ├── assignments/   # Assignment publication & submissions
│   │   │   ├── submissions/   # Submission viewing, download & grading
│   │   │   ├── assessments/   # Timed assessments, question banks, attempts
│   │   │   ├── attempts/      # Autosave answers & attempt finalization
│   │   │   ├── grades/        # Grade amendments & release
│   │   │   ├── announcements/ # Course & institutional announcements
│   │   │   ├── notifications/ # In-app notifications
│   │   │   └── health/        # Liveness (/live) & readiness (/ready) probes
│   │   ├── layout.tsx         # Next.js layout
│   │   └── page.tsx           # Home landing page
│   ├── modules/               # Domain business logic & transactional services
│   │   ├── approvals/         # IT access request approval & user suspension
│   │   ├── assessments/       # Timed tests, answer autosave & auto-marking
│   │   ├── assignments/       # Assignment submission & versioning logic
│   │   ├── audit/             # Centralized audit logging
│   │   ├── auth/              # Entra ID callback, onboarding & auth guards
│   │   ├── courses/           # Scoped course querying & membership management
│   │   ├── grading/           # Marks validation, amendments & release
│   │   ├── materials/         # Material storage & publication
│   │   ├── notifications/     # In-app notifications & announcement delivery
│   │   └── roles/             # Role constants & permission definitions
│   ├── lib/                   # Infrastructure utilities
│   │   ├── database/          # Prisma singleton client
│   │   ├── errors/            # Standard AppError classes & JSON response envelopes
│   │   ├── logging/           # Structured JSON logger with secret sanitization
│   │   ├── microsoft/         # MSAL Node ConfidentialClientApplication client
│   │   ├── security/          # Jose session tokens & crypto helpers
│   │   ├── storage/           # StorageProvider interface & Local/SharePoint implementations
│   │   └── validation/        # Zod environment schema
│   └── scripts/
│       └── seed-admin.ts      # Bootstrap script for roles, permissions & IT Admin
└── tests/
    └── unit/                  # Vitest automated test suites
```

---

## Quickstart & Local Setup

### 1. Prerequisites
- Node.js v20+ or v24+
- PostgreSQL v15+
- npm v10+

### 2. Environment Configuration
Copy `.env.example` to `.env` and configure your database and secrets:
```bash
cp .env.example .env
```

Ensure `SESSION_SECRET` is at least 32 characters long.

### 3. Run Migrations & Seed Database
```bash
# Run versioned database migrations
npm run prisma:deploy

# Seed system roles, permissions, and bootstrap IT Admin account
npm run seed:admin
```

### 4. Run Automated Test Suite
```bash
npm test
```

### 5. Launch Development Server
```bash
npm run dev
```
The server will start at `http://localhost:3000`. Test health endpoints:
- Liveness: `curl http://localhost:3000/api/v1/health/live`
- Readiness: `curl http://localhost:3000/api/v1/health/ready`

---

## Key Security Features

1. **Strict Institutional Tenant Lockdown:** Microsoft Entra ID logins from arbitrary personal Microsoft accounts or unauthorized foreign tenants are rejected immediately.
2. **Mandatory IT Approval Workflow:** Authenticating for the first time creates an unprivileged `PENDING` access request. No academic data is accessible until an IT Administrator reviews and approves the account.
3. **No Email-Based Trust:** Identity is pinned to `(entraTenantId, entraObjectId)` rather than email.
4. **Server-Authoritative Timestamps:** Students cannot manipulate submission deadlines or `isLate` flags; start times and attempt expirations are computed strictly on the server.
5. **IDOR & Scoped Visibility Protection:** Students can only view their own submissions and courses they are enrolled in. Unreleased grades and assessment answer keys remain hidden on the server.
6. **Immutable Audit Trail:** All administrative decisions (approvals, suspensions, grade amendments, course updates) are recorded with timestamps, actor IDs, and sanitized metadata.
