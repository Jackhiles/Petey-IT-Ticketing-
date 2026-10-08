-- CreateEnum
CREATE TYPE "TicketLinkType" AS ENUM ('parent', 'related', 'duplicate', 'merged_into');

-- CreateEnum
CREATE TYPE "SharingVisibility" AS ENUM ('personal', 'group', 'all');

-- CreateTable
CREATE TABLE "tags" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_tags" (
    "ticket_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_tags_pkey" PRIMARY KEY ("ticket_id","tag_id")
);

-- CreateTable
CREATE TABLE "ticket_watchers" (
    "id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "user_id" UUID,
    "email" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ticket_watchers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_links" (
    "id" UUID NOT NULL,
    "from_ticket_id" UUID NOT NULL,
    "to_ticket_id" UUID NOT NULL,
    "link_type" "TicketLinkType" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ticket_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "canned_responses" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "owner_id" UUID NOT NULL,
    "visibility" "SharingVisibility" NOT NULL DEFAULT 'personal',
    "shared_group_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "canned_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "macros" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "actions" JSONB NOT NULL,
    "owner_id" UUID NOT NULL,
    "visibility" "SharingVisibility" NOT NULL DEFAULT 'personal',
    "shared_group_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "macros_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "time_entries" (
    "id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "user_id" UUID,
    "minutes" INTEGER NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "worked_at" TIMESTAMPTZ(3) NOT NULL,
    "message_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "time_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_presence" (
    "ticket_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "is_typing" BOOLEAN NOT NULL DEFAULT false,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ticket_presence_pkey" PRIMARY KEY ("ticket_id","user_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tags_name_key" ON "tags"("name");

-- CreateIndex
CREATE INDEX "ticket_tags_tag_id_idx" ON "ticket_tags"("tag_id");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_watchers_ticket_id_email_key" ON "ticket_watchers"("ticket_id", "email");

-- CreateIndex
CREATE INDEX "ticket_links_to_ticket_id_idx" ON "ticket_links"("to_ticket_id");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_links_from_ticket_id_to_ticket_id_link_type_key" ON "ticket_links"("from_ticket_id", "to_ticket_id", "link_type");

-- CreateIndex
CREATE INDEX "canned_responses_owner_id_idx" ON "canned_responses"("owner_id");

-- CreateIndex
CREATE INDEX "macros_owner_id_idx" ON "macros"("owner_id");

-- CreateIndex
CREATE INDEX "time_entries_ticket_id_idx" ON "time_entries"("ticket_id");

-- CreateIndex
CREATE INDEX "time_entries_user_id_worked_at_idx" ON "time_entries"("user_id", "worked_at");

-- CreateIndex
CREATE INDEX "ticket_presence_last_seen_at_idx" ON "ticket_presence"("last_seen_at");

-- AddForeignKey
ALTER TABLE "ticket_tags" ADD CONSTRAINT "ticket_tags_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_tags" ADD CONSTRAINT "ticket_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_watchers" ADD CONSTRAINT "ticket_watchers_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_watchers" ADD CONSTRAINT "ticket_watchers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_links" ADD CONSTRAINT "ticket_links_from_ticket_id_fkey" FOREIGN KEY ("from_ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_links" ADD CONSTRAINT "ticket_links_to_ticket_id_fkey" FOREIGN KEY ("to_ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canned_responses" ADD CONSTRAINT "canned_responses_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canned_responses" ADD CONSTRAINT "canned_responses_shared_group_id_fkey" FOREIGN KEY ("shared_group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "macros" ADD CONSTRAINT "macros_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "macros" ADD CONSTRAINT "macros_shared_group_id_fkey" FOREIGN KEY ("shared_group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "ticket_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_presence" ADD CONSTRAINT "ticket_presence_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_presence" ADD CONSTRAINT "ticket_presence_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
