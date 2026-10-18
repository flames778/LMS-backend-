# Incident Response & Escalation Framework

## 1. Incident Severity Matrix

| Severity | Definition | Target Resolution | Escalation Path |
|---|---|---|---|
| **P1 - Critical** | Total platform outage, unauthorized student grade alteration, mass credential compromise | < 2 Hours | IT Director, Lead Backend Engineer, Academic Registrar |
| **P2 - High** | Authentication failures for a cohort, submission uploads failing during an exam | < 4 Hours | Lead Backend Engineer, System Administrator |
| **P3 - Medium** | Non-critical feature degradation, notification delivery delay | < 24 Hours | On-call Engineer |
| **P4 - Low** | Minor cosmetic defect or documentation clarification | Next sprint | Development team |

---

## 2. Emergency Account Suspension Playbook

If a compromised account or anomalous activity is detected:

1. **Immediate API Suspension:**
   ```bash
   curl -X POST https://learn.nutm.edu.ng/api/v1/admin/users/{USER_ID}/suspend \
     -H "Authorization: Bearer $ADMIN_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"reason": "Emergency security quarantine due to anomalous login pattern"}'
   ```
2. **Impact on Active Sessions:**
   - The user's active session is blocked immediately by the auth guard upon next API request.
   - All academic access to tests, assignments, and courses is revoked in real-time.
3. **Audit Verification:**
   Query the audit log:
   ```bash
   curl https://learn.nutm.edu.ng/api/v1/admin/audit-logs?actorId={USER_ID} \
     -H "Authorization: Bearer $ADMIN_TOKEN"
   ```
