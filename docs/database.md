# Database Design & Relational Schema

## 1. Relational Model & Normalization

NUTM Learn uses PostgreSQL 15+ managed through Prisma ORM. UUID primary keys are utilized across all primary domain entities, and all datetime columns are stored in UTC.

### Core Entity Relationships

```text
User (1) ──── (N) UserRole (N) ──── (1) Role (1) ──── (N) RolePermission (N) ──── (1) Permission
User (1) ──── (N) AccessRequest
User (1) ──── (N) CourseMembership (N) ──── (1) Course

Course (1) ──── (N) Material
Course (1) ──── (N) Assignment (1) ──── (N) Submission (1) ──── (N) Grade
Course (1) ──── (N) Assessment (1) ──── (N) AssessmentQuestion
Assessment (1) ──── (N) AssessmentAttempt (1) ──── (N) AttemptAnswer
Course (1) ──── (N) Announcement

Grade (1) ──── (N) GradeAudit
User (1) ──── (N) Notification
User (1) ──── (N) AuditLog
```

---

## 2. Table Catalog & Constraint Specifications

| Table | Primary Key | Key Indexes & Uniqueness | Description |
|---|---|---|---|
| `users` | `id` (UUID) | Unique: `[entra_tenant_id, entra_object_id]`, `email` | Institutional user registry |
| `roles` | `id` (UUID) | Unique: `name` | System roles (STUDENT, LECTURER, IT_ADMIN, ACADEMIC_ADMIN) |
| `permissions` | `id` (UUID) | Unique: `name` | Granular capability catalog |
| `role_permissions` | `[role_id, permission_id]` | Composite PK | Role-to-permission mapping |
| `user_roles` | `id` (UUID) | Unique: `[user_id, role_id]` | Assigned roles with grantor tracking |
| `access_requests` | `id` (UUID) | Index: `status`, `user_id` | IT onboarding approval pipeline |
| `courses` | `id` (UUID) | Unique: `[course_code, academic_term]` | Academic course offerings |
| `course_memberships`| `id` (UUID) | Unique: `[course_id, user_id]` | Active course rosters & role assignments |
| `materials` | `id` (UUID) | Index: `[course_id, publication_status]` | Lecture notes and learning resources |
| `assignments` | `id` (UUID) | Index: `[course_id, due_date]` | Graded coursework specifications |
| `submissions` | `id` (UUID) | Unique: `[assignment_id, student_id, submission_version]` | Student work submissions with version tracking |
| `assessments` | `id` (UUID) | Index: `[course_id, publication_status]` | Online tests and timed quizzes |
| `assessment_questions`| `id` (UUID) | Index: `[assessment_id, question_order]` | Question items with server-held answer keys |
| `assessment_attempts` | `id` (UUID) | Unique: `[assessment_id, student_id, attempt_number]` | Timed test attempts with authoritative deadlines |
| `attempt_answers` | `id` (UUID) | Unique: `[attempt_id, question_id]` | Autosaved student responses |
| `grades` | `id` (UUID) | Index: `[student_id, release_status]` | Awarded marks and feedback |
| `grade_audits` | `id` (UUID) | Index: `grade_id` | Immutable grade amendment trail |
| `announcements` | `id` (UUID) | Index: `[course_id, status]` | Course & campus communications |
| `notifications` | `id` (UUID) | Index: `[recipient_id, is_read]` | In-app notification queue |
| `audit_logs` | `id` (UUID) | Index: `[actor_id, timestamp]`, `timestamp` | Security event audit log |

---

## 3. Migration Policy & Integrity Safeguards

- Version-controlled SQL migrations reside in `prisma/migrations/`.
- Deletions on critical references use `onDelete: Restrict` (e.g. uploader of published materials, creator of assignments, grading lecturers) to prevent accidental loss of historical academic records.
- User data cascades only to dependent operational records (e.g. personal attempts, memberships) under controlled IT workflows.
