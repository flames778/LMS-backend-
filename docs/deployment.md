# Deployment, Migrations & Operational Configuration

## 1. Hosting Architecture & Prerequisites

- **Compute:** Production Node.js runtime (v20 LTS or v24 LTS) containerized or hosted in school-approved production cloud instances.
- **Relational Storage:** Managed PostgreSQL instance (AWS RDS, Azure Database for PostgreSQL, or institutional servers) with automated point-in-time recovery.
- **Reverse Proxy / Edge:** NGINX or cloud load balancer providing TLS 1.3 termination, rate-limiting, and standard security headers.

---

## 2. Environment Variables & Production Secrets

Ensure the following variables are populated in your secure secret manager:
```bash
DATABASE_URL="postgresql://db_user:vault_secret@db.nutm.edu.ng:5432/nutm_lms?sslmode=require"
SESSION_SECRET="64-byte-cryptographically-random-string"
ADMIN_BOOTSTRAP_SECRET="high-entropy-one-time-bootstrap-key"
ENTRA_TENANT_ID="nutm-official-azure-tenant-id"
ENTRA_CLIENT_ID="nutm-learn-app-client-id"
ENTRA_CLIENT_SECRET="nutm-learn-app-client-secret"
ENTRA_REDIRECT_URI="https://learn.nutm.edu.ng/api/v1/auth/callback"
STORAGE_PROVIDER="sharepoint" # or "local"
SHAREPOINT_SITE_ID="nutm.sharepoint.com,site-uuid,web-uuid"
SHAREPOINT_DRIVE_ID="drive-uuid"
```

---

## 3. Deployment Steps

```bash
# 1. Install production dependencies
npm ci

# 2. Apply versioned database migrations
npm run prisma:deploy

# 3. Seed base roles & permissions (idempotent)
npm run seed:admin

# 4. Compile optimized production Next.js build
npm run build

# 5. Start server
npm run start
```

---

## 4. Rollback & Disaster Protocol

If a release must be rolled back:
1. Re-deploy the previous application artifact or Docker image.
2. In the event of schema adjustments, inspect the latest migration file in `prisma/migrations/` and apply the targeted down-migration SQL script manually.
3. Validate service readiness with `curl https://learn.nutm.edu.ng/api/v1/health/ready`.
