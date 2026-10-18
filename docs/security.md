# Application Security & Threat Model

## 1. Threat Model & Institutional Risk Analysis

| Threat Actor | Threat Vector | Mitigation Strategy in NUTM Learn |
|---|---|---|
| **External Attacker** | Forged Microsoft tokens / cross-tenant logins | Strict validation of `tid === env.ENTRA_TENANT_ID`. External Microsoft tenants rejected automatically. |
| **External Attacker** | Tampering with session tokens | Session cookies signed with `HS256` via `jose`, marked `HttpOnly`, `SameSite: Lax`, and `Secure`. |
| **Unauthorized User** | Direct self-registration with institutional email | New accounts enter `PENDING` state. Access to courses, materials, and tests is blocked until IT Admin reviews and approves. |
| **Student** | Insecure Direct Object Reference (IDOR) to view peer submissions | Scoped queries check `submission.studentId === user.id`. Peeking at peers' submissions returns 403 Forbidden. |
| **Student** | Client-side manipulation of submission deadlines (`isLate`) | The browser cannot supply or override `isLate` or timestamps; submission time is calculated by `new Date()` on the server. |
| **Student** | Tampering with test duration or timer countdown | Timed assessment deadline is computed on the server during attempt creation and strictly verified upon every autosave and submit. |
| **Student** | Early retrieval of answer keys | Correct answers and explanations are stripped at the service layer prior to delivering question payloads to students. |
| **Malicious User** | Path traversal in file storage uploads/downloads | File names and paths are sanitized. `path.resolve` checks guarantee files stay inside the sandboxed directory. |
| **Rogue Lecturer** | Unauthorized grade modifications | All grade alterations require a mandatory change reason and produce permanent `GradeAudit` history records. |
| **Compromised Admin** | Self-approval of elevated privileges | Separation of duties check prohibits an administrator from approving their own access requests. |

---

## 2. Server-Authoritative Controls

1. **Default-Deny Access:** Every API endpoint validates authenticated identity and checks permissions before executing business logic.
2. **Real-time Status Revocation:** Even if a user possesses a valid unexpired session JWT, suspending their account in the database immediately causes subsequent requests to be denied.
3. **Structured Logging Sanitization:** The logger automatically scrubs passwords, client secrets, tokens, authorization headers, and assessment answer keys to prevent sensitive data leakage.
