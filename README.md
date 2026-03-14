# Inter Track Service

Backend REST service for internship/job application tracking with pipeline history, recruitment-related emails, and basic automation foundations.

## Stack

- Node.js + Express
- TypeScript
- PostgreSQL (`pg`)
- Railway-compatible (`DATABASE_URL`)

## Important Architecture Rules

1. This service **does not handle login/authentication**.
2. It expects a validated user identity from API Gateway/Auth in header `x-user-id`.
3. Every query is scoped by `user_id` to avoid tenant data leakage.
4. Database schema initialization is idempotent and runs automatically at boot.
5. Designed to scale with workers: automation data (`automation_rules`, `automation_runs`) is persisted independently from request lifecycle.

## Project Structure

```txt
inter_track_service/
├── src/
│   ├── config/            # Env and PostgreSQL pool setup
│   ├── controllers/       # Endpoint business logic
│   ├── database/          # Boot SQL schema (idempotent)
│   ├── middleware/        # user context, validation, errors
│   ├── routes/            # REST route definitions
│   ├── types/             # Shared TypeScript types
│   ├── utils/             # Async + error helpers
│   └── index.ts           # HTTP server bootstrap
├── tests/
│   └── intern-track-service.postman_collection.json
├── Dockerfile
├── railway.json
├── package.json
└── tsconfig.json
```

## Environment Variables

Copy `.env.example` to `.env` and set values:

```env
PORT=3003
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173

DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=internship_service

# Railway provides this in production
# DATABASE_URL=postgresql://user:password@host:port/database
```

## Boot-Time SQL (Auto Create, Idempotent)

On startup, the service runs SQL from `src/database/schema.ts` using:

- `CREATE EXTENSION IF NOT EXISTS pgcrypto`
- `CREATE TABLE IF NOT EXISTS ...` for:
  - `applications`
  - `pipeline_events`
  - `contacts`
  - `companies`
  - `emails`
  - `automation_rules`
  - `automation_runs`
- `CREATE INDEX IF NOT EXISTS ...`
- Trigger creation wrapped in `DO $$ ... IF NOT EXISTS ... $$`

This guarantees repeatable deployments without dropping existing data.

## API Endpoints

Base path: `/api`

### Health

- `GET /health`

Response:

```json
{
  "success": true,
  "message": "Internship service is running",
  "timestamp": "2026-03-13T20:40:00.000Z"
}
```

### Applications (CRUD)

- `POST /applications`
- `GET /applications?page=1&limit=20&status=applied&search=backend`
- `GET /applications/:id`
- `PATCH /applications/:id`
- `DELETE /applications/:id`

Create request example:

```json
{
  "companyName": "Acme Labs",
  "roleTitle": "Backend Intern",
  "status": "applied",
  "source": "LinkedIn",
  "appliedAt": "2026-03-01",
  "notes": "Referral by alumni"
}
```

Create response example:

```json
{
  "success": true,
  "data": {
    "id": "4eb31f36-4f4b-4f4b-94f4-43f54a8f6f87",
    "user_id": "user_123",
    "role_title": "Backend Intern",
    "status": "applied"
  }
}
```

### Pipeline History

- `POST /applications/:id/pipeline-events`
- `GET /applications/:id/pipeline-events`

Create event request:

```json
{
  "toStatus": "interview",
  "notes": "Recruiter screening completed",
  "metadata": { "interviewer": "Ana" }
}
```

### Dashboard Metrics

- `GET /metrics/dashboard`
- `GET /metrics/dashboard?from=2026-03-01&to=2026-03-31`

Response shape:

```json
{
  "success": true,
  "data": {
    "summary": {
      "total": 12,
      "active": 8,
      "offers": 1,
      "rejections": 2
    },
    "byStatus": [
      { "status": "applied", "count": 5 },
      { "status": "interview", "count": 3 }
    ],
    "last30DaysEvents": [
      { "day": "2026-03-12", "events": 2 }
    ],
    "emails": {
      "inbound": 6,
      "outbound": 4
    }
  }
}
```

### Recruitment Emails

- `POST /applications/:id/emails`
- `GET /applications/:id/emails`

Create email request:

```json
{
  "direction": "inbound",
  "subject": "Interview Invitation",
  "bodyPreview": "We would like to schedule...",
  "receivedAt": "2026-03-13T10:00:00.000Z"
}
```

### Contacts & Companies

- `POST /companies`
- `GET /companies`
- `POST /contacts`
- `GET /contacts?applicationId=<uuid>&companyId=<uuid>`

### Automation Foundation

- `POST /automation/rules`
- `GET /automation/rules`
- `POST /automation/runs`
- `GET /automation/runs?ruleId=<uuid>&applicationId=<uuid>&status=queued`

## Error Handling

- Input validation via `express-validator`
- Consistent error envelope:

```json
{
  "success": false,
  "message": "Validation errors",
  "errors": [{ "field": "roleTitle", "message": "Invalid value" }]
}
```

## Local Development

```bash
npm install
npm run dev
```

Build and run:

```bash
npm run build
npm start
```

## Docker

```bash
docker build -t inter-track-service .
docker run -p 3003:3003 --env-file .env inter-track-service
```

## Basic Endpoint Tests Collection

Import Postman collection:

- `tests/intern-track-service.postman_collection.json`

Required variables:

- `baseUrl` (default `http://localhost:3003`)
- `userId` (simulated user id from gateway)
- `applicationId` (set after creating an application)

## API Gateway Integration Notes

Expose this service behind gateway with forwarded `x-user-id` header from validated auth context.
Suggested gateway prefix:

- `/api/internships/*` -> `inter_track_service /api/*`
