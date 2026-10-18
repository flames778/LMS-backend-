# REST API Reference (`/api/v1`)

All endpoints adhere to predictable envelope conventions.

### Standard Success Response
```json
{
  "data": { ... },
  "requestId": "uuid"
}
```

### Standard Error Response
```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Descriptive message without leaking internal details",
    "details": { ... }
  },
  "requestId": "uuid"
}
```

---

## 1. Authentication & Identity

| Method | Endpoint | Permissions | Description |
|---|---|---|---|
| `GET` | `/api/v1/auth/signin` | Public | Initiates Microsoft Entra ID login flow |
| `GET/POST`| `/api/v1/auth/callback` | Public | Handles Microsoft OIDC code exchange & sets session |
| `POST` | `/api/v1/auth/logout` | Authenticated | Clears session cookie and invalidates session |
| `GET` | `/api/v1/auth/me` | Authenticated | Retrieves current profile, status, and assigned roles |

---

## 2. IT Administration & Governance

| Method | Endpoint | Permissions | Description |
|---|---|---|---|
| `GET` | `/api/v1/admin/access-requests` | `users.read` | Lists onboarding requests (`status`, pagination) |
| `GET` | `/api/v1/admin/access-requests/:id` | `users.read` | Retrieves specific onboarding request |
| `POST`| `/api/v1/admin/access-requests/:id/approve` | `users.approve` | Approves request & assigns initial role |
| `POST`| `/api/v1/admin/access-requests/:id/reject` | `users.approve` | Rejects access request with decision reason |
| `POST`| `/api/v1/admin/users/:id/suspend` | `users.suspend` | Suspends user account immediately |
| `POST`| `/api/v1/admin/users/:id/reactivate` | `users.suspend` | Restores suspended user account |
| `POST`| `/api/v1/admin/users/:id/roles` | `roles.assign` | Assigns system role to user |
| `DELETE`| `/api/v1/admin/users/:id/roles/:roleName` | `roles.assign` | Revokes system role from user |
| `GET` | `/api/v1/admin/audit-logs` | `audit.read` | Queries centralized audit log stream |

---

## 3. Courses & Enrolments

| Method | Endpoint | Permissions | Description |
|---|---|---|---|
| `GET` | `/api/v1/courses` | Approved User | Lists courses (scoped to enrolled courses for students/lecturers) |
| `POST`| `/api/v1/courses` | `courses.create` | Creates new course offering |
| `GET` | `/api/v1/courses/:courseId` | Enrolled / Admin | Gets course details |
| `PATCH`| `/api/v1/courses/:courseId` | Assigned Lecturer / Admin | Updates course title, description, or status |
| `POST`| `/api/v1/courses/:courseId/archive` | `courses.archive` | Archives course |
| `GET` | `/api/v1/courses/:courseId/members` | Enrolled / Admin | Lists course roster members |
| `POST`| `/api/v1/courses/:courseId/members` | `enrolments.manage` | Adds student or lecturer to course |
| `PATCH`| `/api/v1/courses/:courseId/members/:userId` | `enrolments.manage` | Updates membership status or type |
| `DELETE`| `/api/v1/courses/:courseId/members/:userId` | `enrolments.manage` | Removes member from course |

---

## 4. Materials, Assignments & Submissions

| Method | Endpoint | Permissions | Description |
|---|---|---|---|
| `GET` | `/api/v1/courses/:courseId/materials` | Enrolled / Admin | Lists materials (students see only published) |
| `POST`| `/api/v1/courses/:courseId/materials` | Assigned Lecturer / Admin | Uploads lecture file or document (draft by default) |
| `POST`| `/api/v1/materials/:materialId/publish` | Assigned Lecturer / Admin | Publishes material to students |
| `GET` | `/api/v1/materials/:materialId/download` | Enrolled / Admin | Downloads file content stream |
| `GET` | `/api/v1/courses/:courseId/assignments` | Enrolled / Admin | Lists assignments |
| `POST`| `/api/v1/courses/:courseId/assignments` | Assigned Lecturer / Admin | Creates assignment |
| `POST`| `/api/v1/assignments/:assignmentId/publish` | Assigned Lecturer / Admin | Publishes assignment |
| `POST`| `/api/v1/assignments/:assignmentId/submissions` | Enrolled Student | Submits coursework (server timestamp & versioning) |
| `GET` | `/api/v1/assignments/:assignmentId/submissions/me` | Enrolled Student | Retrieves student's own submission versions |
| `GET` | `/api/v1/assignments/:assignmentId/submissions` | Assigned Lecturer / Admin | Lists all student submissions for grading |
| `GET` | `/api/v1/submissions/:submissionId` | Submission Owner / Lecturer | Gets submission details |
| `GET` | `/api/v1/submissions/:submissionId/download` | Submission Owner / Lecturer | Downloads submitted file |

---

## 5. Assessments, Attempts & Grading

| Method | Endpoint | Permissions | Description |
|---|---|---|---|
| `GET` | `/api/v1/courses/:courseId/assessments` | Enrolled / Admin | Lists assessments |
| `POST`| `/api/v1/courses/:courseId/assessments` | Assigned Lecturer / Admin | Creates timed assessment |
| `POST`| `/api/v1/assessments/:assessmentId/questions` | Assigned Lecturer / Admin | Adds question with answer key |
| `POST`| `/api/v1/assessments/:assessmentId/publish` | Assigned Lecturer / Admin | Publishes assessment for student taking |
| `GET` | `/api/v1/assessments/:assessmentId` | Enrolled Student / Admin | Fetches assessment (answer keys masked) |
| `POST`| `/api/v1/assessments/:assessmentId/attempts` | Enrolled Student | Starts timed attempt (authoritative deadline) |
| `PUT` | `/api/v1/attempts/:attemptId/answers/:questionId` | Attempt Owner | Autosaves question answer |
| `POST`| `/api/v1/attempts/:attemptId/submit` | Attempt Owner | Finalizes attempt with deterministic auto-grading |
| `POST`| `/api/v1/submissions/:submissionId/grade` | Assigned Lecturer / Admin | Grades assignment submission (unreleased) |
| `PATCH`| `/api/v1/grades/:gradeId` | Assigned Lecturer / Admin | Amends grade with required change reason |
| `POST`| `/api/v1/grades/:gradeId/release` | Assigned Lecturer / Admin | Releases grade to student view |
| `GET` | `/api/v1/students/me/grades` | Approved Student | Lists student's released grades |

---

## 6. Announcements, Notifications & Health

| Method | Endpoint | Permissions | Description |
|---|---|---|---|
| `GET` | `/api/v1/announcements` | Approved User | Lists published announcements for enrolled courses |
| `POST`| `/api/v1/announcements` | Lecturer / Admin | Creates course or institutional announcement |
| `POST`| `/api/v1/announcements/:announcementId/publish` | Author / Admin | Publishes announcement & dispatches alerts |
| `GET` | `/api/v1/notifications` | Authenticated | Lists user's in-app notifications |
| `PATCH`| `/api/v1/notifications/:notificationId/read` | Notification Recipient | Marks notification as read |
| `GET` | `/api/v1/health/live` | Public | Liveness probe |
| `GET` | `/api/v1/health/ready` | Public | Readiness probe (tests DB connectivity) |
