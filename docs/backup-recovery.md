# Database & File Storage Backup & Disaster Recovery

## 1. Recovery Objectives

- **Recovery Point Objective (RPO):** Maximum 1 hour (daily automated snapshots + hourly WAL archives).
- **Recovery Time Objective (RTO):** Under 2 hours to full production restoration.

---

## 2. PostgreSQL Relational Backups

### Automated Daily Logical Dump Script
```bash
#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="/var/backups/nutm_lms"
TIMESTAMP=$(date -u +"%Y%m%d_%H%M%SZ")
BACKUP_FILE="${BACKUP_DIR}/nutm_lms_${TIMESTAMP}.sql.gz"

mkdir -p "${BACKUP_DIR}"

pg_dump -h localhost -p 5432 -U postgres -d nutm_lms --clean --if-exists | gzip > "${BACKUP_FILE}"

# Encrypt backup with institutional public key
gpg --encrypt --recipient it-sec@nutm.edu.ng "${BACKUP_FILE}"
rm "${BACKUP_FILE}"

echo "Backup completed: ${BACKUP_FILE}.gpg"
```

---

## 3. Atomic Database & File Storage Restoration Protocol

1. **Database Restoration:**
   ```bash
   # Decrypt and restore PostgreSQL database
   gpg --decrypt /var/backups/nutm_lms/nutm_lms_TIMESTAMP.sql.gz.gpg | gunzip | psql -U postgres -d nutm_lms
   ```
2. **File Storage Verification:**
   - If using `STORAGE_PROVIDER="local"`: Restore `/storage` directory from encrypted snapshot corresponding to the database backup timestamp.
   - If using `STORAGE_PROVIDER="sharepoint"`: Verify SharePoint Online versioning and recycle bin status to ensure object IDs remain consistent with database storage references.
3. **Run Health Verification:**
   ```bash
   curl -I http://localhost:3000/api/v1/health/ready
   ```
