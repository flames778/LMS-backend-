# System Architecture & Trust Boundaries

## 1. Architectural Overview

NUTM Learn is engineered as a layered modular monolith operating on Next.js / TypeScript, utilizing PostgreSQL as the authoritative relational data store and Microsoft Entra ID as the federated institutional identity provider.

```text
[ Browser / Client ]
        │  HTTPS (Session Cookie / Bearer Token)
        ▼
[ Edge / API Layer (/api/v1) ]
        │  Input Validation (Zod) & Auth Context Extraction
        ▼
[ Security & RBAC Guards ]  ◄── Authenticate User & Validate Active DB Status
        │  Default Deny / Scoped Membership Verification
        ▼
[ Business Domain Services ] (modules/*)
        │  Transactional State Mutations & Event Emission
        ▼
[ Persistence & Storage ] ───► [ PostgreSQL via Prisma ORM ]
                         ───► [ Storage Provider (SharePoint / Local Sandbox) ]
                         ───► [ Immutable Audit Log Service ]
```

---

## 2. Trust Boundaries & Identity Flow

### A. Authentication vs. Authorization Boundary
- **Microsoft Entra ID:** Establishes and verifies identity. Returns cryptographically signed OIDC tokens containing `tid` (tenant ID) and `oid` (immutable user object ID).
- **NUTM Learn Backend:** Establishes and enforces institutional permissions. A successful Microsoft login *never* automatically grants academic access, lecturer rights, or IT administration privileges.
- Every incoming request to protected resources re-verifies user status against the live database:
  - `SUSPENDED` users are blocked immediately, even if their session JWT has not expired.
  - `PENDING` users cannot access course materials, submissions, or tests.

### B. Client vs. Server Data Boundary
- **Submission Timestamps:** Calculated exclusively from the backend system clock (`new Date()`). Client-provided timestamps or `isLate` values in JSON payloads are discarded.
- **Assessment Timer:** The client maintains a countdown timer purely for UX. The authoritative deadline is stored on the server upon attempt creation (`min(startedAt + duration, availableUntil)`).
- **Answer Key Masking:** Correct answers (`correctAnswers`) and pedagogical explanations are stripped before delivering question lists to students.

---

## 3. Storage Architecture

```text
Upload Request
     │
     ▼
[ Validate File Size & MIME ]
     │
     ▼
[ Sanitize File Name & Key ]
     │
     ▼
[ StorageProvider Abstraction ]
     ├── LocalStorageProvider: Sandboxed directory with path traversal checks
     └── SharePointGraphStorageProvider: Microsoft Graph DriveItem uploads
     │
     ▼
[ Store Object Reference & Metadata in PostgreSQL ]
```

File contents are never stored directly inside PostgreSQL. File metadata, cryptographic size, content type, uploader ID, and storage references are recorded in the database, while the physical byte streams reside in the isolated storage provider.
