CREATE TYPE "ProjectStatus" AS ENUM ('active', 'paused', 'archived');
CREATE TYPE "LeadFileStatus" AS ENUM ('unassigned', 'imported', 'needs_enrichment', 'enriching', 'enriched', 'needs_review', 'ready_for_outreach', 'archived');
CREATE TYPE "EnrichmentStatus" AS ENUM ('not_enriched', 'enriched', 'not_found', 'invalid_npi', 'error');
CREATE TYPE "CleanlyStatus" AS ENUM ('new', 'needs_review', 'cleaned', 'approved', 'archived');
CREATE TYPE "OutreachStatus" AS ENUM ('not_contacted', 'contacted', 'follow_up_needed', 'responded', 'not_interested', 'bad_contact', 'do_not_contact');
CREATE TYPE "ResponseStatus" AS ENUM ('unknown', 'no_response', 'positive', 'negative', 'needs_follow_up');
CREATE TYPE "ActivityEntityType" AS ENUM ('project', 'file', 'lead');

CREATE TABLE "projects" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "status" "ProjectStatus" NOT NULL DEFAULT 'active',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "lead_files" (
  "id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "original_filename" TEXT NOT NULL,
  "display_name" TEXT NOT NULL,
  "file_type" TEXT NOT NULL DEFAULT 'csv',
  "upload_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "upload_week" TEXT NOT NULL DEFAULT 'unassigned',
  "uploaded_by" TEXT NOT NULL DEFAULT '',
  "row_count" INTEGER NOT NULL DEFAULT 0,
  "status" "LeadFileStatus" NOT NULL DEFAULT 'unassigned',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "lead_files_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "leads" (
  "id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "file_id" TEXT NOT NULL,
  "row_index" INTEGER NOT NULL,
  "npi_number" TEXT NOT NULL DEFAULT '',
  "first_name" TEXT NOT NULL DEFAULT '',
  "last_name" TEXT NOT NULL DEFAULT '',
  "full_name" TEXT NOT NULL DEFAULT '',
  "organization_name" TEXT NOT NULL DEFAULT '',
  "email" TEXT NOT NULL DEFAULT '',
  "phone" TEXT NOT NULL DEFAULT '',
  "fax" TEXT NOT NULL DEFAULT '',
  "address" TEXT NOT NULL DEFAULT '',
  "city" TEXT NOT NULL DEFAULT '',
  "state" TEXT NOT NULL DEFAULT '',
  "zip" TEXT NOT NULL DEFAULT '',
  "specialty" TEXT NOT NULL DEFAULT '',
  "primary_taxonomy" TEXT NOT NULL DEFAULT '',
  "raw_row_data" JSONB NOT NULL,
  "enrichment_data" JSONB NOT NULL,
  "enrichment_status" "EnrichmentStatus" NOT NULL DEFAULT 'not_enriched',
  "cleanly_status" "CleanlyStatus" NOT NULL DEFAULT 'new',
  "outreach_status" "OutreachStatus" NOT NULL DEFAULT 'not_contacted',
  "response_status" "ResponseStatus" NOT NULL DEFAULT 'unknown',
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "last_contacted_at" TIMESTAMP(3),
  "next_follow_up_at" TIMESTAMP(3),
  "notes" TEXT NOT NULL DEFAULT '',
  "owner_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tags" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "color" TEXT NOT NULL DEFAULT '#111111',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "lead_file_tags" (
  "file_id" TEXT NOT NULL,
  "tag_id" TEXT NOT NULL,
  CONSTRAINT "lead_file_tags_pkey" PRIMARY KEY ("file_id", "tag_id")
);

CREATE TABLE "lead_tags" (
  "lead_id" TEXT NOT NULL,
  "tag_id" TEXT NOT NULL,
  CONSTRAINT "lead_tags_pkey" PRIMARY KEY ("lead_id", "tag_id")
);

CREATE TABLE "team_members" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'operator',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "team_members_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "activity_log" (
  "id" TEXT NOT NULL,
  "entity_type" "ActivityEntityType" NOT NULL,
  "entity_id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "metadata" JSONB NOT NULL,
  "created_by" TEXT NOT NULL DEFAULT '',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "activity_log_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "settings" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tags_name_key" ON "tags"("name");
CREATE UNIQUE INDEX "team_members_email_key" ON "team_members"("email");
CREATE UNIQUE INDEX "settings_key_key" ON "settings"("key");

CREATE INDEX "projects_status_idx" ON "projects"("status");
CREATE INDEX "lead_files_project_id_idx" ON "lead_files"("project_id");
CREATE INDEX "lead_files_status_idx" ON "lead_files"("status");
CREATE INDEX "lead_files_upload_week_idx" ON "lead_files"("upload_week");
CREATE INDEX "leads_project_id_idx" ON "leads"("project_id");
CREATE INDEX "leads_file_id_idx" ON "leads"("file_id");
CREATE INDEX "leads_npi_number_idx" ON "leads"("npi_number");
CREATE INDEX "leads_enrichment_status_idx" ON "leads"("enrichment_status");
CREATE INDEX "leads_cleanly_status_idx" ON "leads"("cleanly_status");
CREATE INDEX "leads_outreach_status_idx" ON "leads"("outreach_status");
CREATE INDEX "leads_response_status_idx" ON "leads"("response_status");
CREATE INDEX "leads_next_follow_up_at_idx" ON "leads"("next_follow_up_at");
CREATE INDEX "activity_log_entity_type_entity_id_idx" ON "activity_log"("entity_type", "entity_id");
CREATE INDEX "activity_log_created_at_idx" ON "activity_log"("created_at");

ALTER TABLE "lead_files" ADD CONSTRAINT "lead_files_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "leads" ADD CONSTRAINT "leads_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "leads" ADD CONSTRAINT "leads_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "lead_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "leads" ADD CONSTRAINT "leads_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "team_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "lead_file_tags" ADD CONSTRAINT "lead_file_tags_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "lead_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lead_file_tags" ADD CONSTRAINT "lead_file_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lead_tags" ADD CONSTRAINT "lead_tags_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lead_tags" ADD CONSTRAINT "lead_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
