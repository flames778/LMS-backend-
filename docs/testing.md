# Automated Testing & Verification Strategy

## 1. Test Suite Architecture

The automated test suite runs via **Vitest** with a direct connection to a PostgreSQL database.

```text
tests/unit/
  ├── foundation.test.ts               # Env validation, DB queries, crypto & session tests
  ├── auth-approval.test.ts            # Entra onboarding, IT approval, suspension & RBAC
  ├── courses.test.ts                  # Course CRUD, membership scoping, archive & ID uniqueness
  ├── materials-assignments.test.ts    # File uploads, server timestamps, resubmissions & IDOR
  ├── assessments-grading.test.ts      # Timed tests, autosave, deterministic auto-scoring & grading
  └── notifications-announcements.test.ts # Course/institutional announcements & notification queues
```

---

## 2. Running Automated Tests

```bash
# Run complete test suite
npm test

# Run tests in interactive watch mode
npm run test:watch
```

---

## 3. Coverage Summary & Key Invariants Verified

- **Session Expiry & Rejection:** Tampered or invalid session tokens fail verification.
- **Path Traversal Protection:** Directory traversal requests (e.g. `../../../etc/passwd`) are blocked by the storage provider.
- **Tenant Lockdown:** Tokens from unauthorized external tenants are rejected.
- **Separation of Duties:** Administrators cannot approve their own onboarding requests.
- **Immediate Suspension:** Suspended users are denied access on their next request even with a valid JWT.
- **Server Timestamps:** Submission timestamps cannot be spoofed by client request payloads.
- **Resubmission Immutability:** Submissions increment version counts without overwriting earlier student work.
- **Answer Key Security:** Answer keys are never leaked to students before formal release.
- **IDOR Mitigation:** Students cannot query or download peer submissions.
