# Cleanly

Cleanly is a Next.js App Router workspace for importing healthcare outreach CSVs, mapping NPI columns, enriching leads through the CMS NPI Registry, and managing lead operations.

## Current Architecture

- `app/page.tsx` contains the current client workflow and workspace UI.
- `app/api/npi/route.ts` proxies CMS NPI Registry calls and returns normalized data.
- `lib/npi.ts` is the central NPI response typing, normalization, and flattening module.
- `lib/db.ts` initializes Prisma lazily for server-side database code.
- `prisma/schema.prisma` defines the persistent data model for projects, files, leads, tags, team members, activity logs, and settings.
- `prisma/migrations/0001_init/migration.sql` is the initial Railway Postgres migration.

The app now uses Postgres for saved projects/files/leads when `DATABASE_URL` is configured. Browser storage is only used for harmless UI preferences such as the selected workspace tab.

## Environment Variables

Create `.env` locally:

```bash
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE"
```

Railway should provide `DATABASE_URL` from the Railway Postgres service. If the service is named `Postgres`, set the app service variable to:

```bash
DATABASE_URL=${{Postgres.DATABASE_URL}}
```

## Local Development

Install dependencies:

```bash
npm install
```

Generate the Prisma client:

```bash
npm run db:generate
```

Run local migrations after `DATABASE_URL` points to a local or cloud Postgres database:

```bash
npm run db:migrate
```

Start the dev server:

```bash
npm run dev
```

Useful checks:

```bash
npm run typecheck
npm run lint
npm run build
```

Check database connectivity after configuring `DATABASE_URL`:

```bash
curl http://localhost:3000/api/health/db
```

## Railway Deployment

This repo includes `railway.json` for Railway deployment:

- Build command: `npm run build`
- Pre-deploy command: `npm run db:deploy`
- Start command: `npm run start`
- Health check path: `/api/health/db`

Recommended Railway setup:

1. Create a Railway project.
2. Add a Railway Postgres service.
3. Add this Next.js app service from the repository.
4. Set `DATABASE_URL` on the app service using the Postgres service reference variable.
5. Deploy the app.
6. Confirm `npm run db:deploy` runs before the app starts.
7. Check Railway deployment logs for migration, build, start, and health-check failures.

The Railway CLI is not currently installed in this local environment, so linking, deploying, and checking Railway logs must be done from a machine/session with Railway CLI access or from the Railway dashboard.

## Database Scripts

```bash
npm run db:generate
npm run db:migrate
npm run db:deploy
npm run db:studio
```

- `db:generate` creates the Prisma client in `lib/generated/prisma`.
- `db:migrate` is for local development migrations.
- `db:deploy` applies committed migrations in production.
- `db:studio` opens Prisma Studio for local inspection.

## Persistence Decisions

- Railway Postgres is the source of truth for business data.
- Browser storage may only be used for harmless UI preferences such as selected tab, table density, filters, or column visibility.
- Uploaded CSVs should be stored as parsed database rows plus file metadata for the MVP.
- Server filesystem storage is not durable and should not be used for uploaded list retention.
- Exact original file retention should use object storage later if the product requires it.

## Project Persistence API

The first persistence pass saves the current client workspace snapshot while also projecting data into normalized tables.

- `GET /api/projects` lists saved projects/files.
- `POST /api/projects` saves the current workspace draft as a project, lead file, and lead rows.
- `GET /api/projects/:id` loads a saved project back into the workspace.
- `PUT /api/projects/:id` updates a saved snapshot.
- `DELETE /api/projects/:id` deletes a saved project and its files/leads.

The UI loads the most recently updated saved project on startup when the database is available. If `DATABASE_URL` is missing, the app still supports in-memory import/enrichment/export, but saved projects will not survive refresh.

## Lead Workspace And Weekly Workflow

The Leads tab uses client-side pagination by default to avoid rendering every matching row at once. Search, saved views, sorting, bulk outreach updates, inline status editing, and the detail panel continue to work against the current loaded workspace.

The Weekly Workflow tab groups saved files by Monday-start calendar weeks, then renders those week cards inside month/year sections. The active file can be assigned to an exact week such as `2026-05-04`, and that assignment is saved into `lead_files.upload_week` when the project is saved.

## Next Phase

The next persistence phase should make lead edits server-native instead of snapshot-based:

- Add paginated `GET /api/leads` with search/filter/sort.
- Add per-lead update routes for outreach status, notes, owner, follow-up, and tags.
- Add bulk update routes for selected leads.
- Persist enrichment updates immediately after a run.
- Move Files and Weekly Workflow actions from snapshot operations to first-class database mutations.
