import type { PrismaClient } from "./generated/prisma/client";

export const SEED_DEPARTMENTS = ["IT", "Finance", "Human Resources", "Operations", "Sales"];

export const SEED_GROUPS = [
  { name: "Service Desk", description: "First-line support for all requests" },
  { name: "Network", description: "Connectivity, Wi-Fi, VPN and firewalls" },
  { name: "Hardware", description: "Laptops, desktops, printers and peripherals" },
];

/**
 * Inserts starter departments and groups on a fresh install. Each table is seeded only
 * while it is empty, so admins can rename or delete the defaults without them coming back.
 * No users are seeded: the first-run setup screen creates the first admin.
 */
export async function seed(prisma: PrismaClient): Promise<void> {
  if ((await prisma.department.count()) === 0) {
    await prisma.department.createMany({ data: SEED_DEPARTMENTS.map((name) => ({ name })) });
  }
  if ((await prisma.group.count()) === 0) {
    await prisma.group.createMany({ data: SEED_GROUPS });
  }
}
