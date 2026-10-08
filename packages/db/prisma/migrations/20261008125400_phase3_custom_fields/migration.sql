-- CreateEnum
CREATE TYPE "CustomFieldType" AS ENUM ('text', 'textarea', 'number', 'date', 'select', 'checkbox');

-- CreateEnum
CREATE TYPE "CustomFieldAppliesTo" AS ENUM ('all', 'incident', 'request');

-- AlterTable
ALTER TABLE "tickets" ADD COLUMN     "custom_fields" JSONB NOT NULL DEFAULT '{}';

-- CreateTable
CREATE TABLE "custom_field_defs" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "field_type" "CustomFieldType" NOT NULL,
    "options" JSONB NOT NULL DEFAULT '[]',
    "applies_to" "CustomFieldAppliesTo" NOT NULL DEFAULT 'all',
    "required" BOOLEAN NOT NULL DEFAULT false,
    "visible_to_requesters" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "custom_field_defs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "custom_field_defs_key_key" ON "custom_field_defs"("key");
