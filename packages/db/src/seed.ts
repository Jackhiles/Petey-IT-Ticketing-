import type { PrismaClient } from "./generated/prisma/client";

export const SEED_DEPARTMENTS = ["IT", "Finance", "Human Resources", "Operations", "Sales"];

export const SEED_GROUPS = [
  { name: "Service Desk", description: "First-line support for all requests" },
  { name: "Network", description: "Connectivity, Wi-Fi, VPN and firewalls" },
  { name: "Hardware", description: "Laptops, desktops, printers and peripherals" },
];

export const SEED_STATUSES = [
  { name: "Open", type: "open", pausesSla: false, sortOrder: 10, isDefault: true },
  { name: "In progress", type: "open", pausesSla: false, sortOrder: 20, isDefault: false },
  { name: "On hold", type: "on_hold", pausesSla: true, sortOrder: 30, isDefault: false },
  { name: "Resolved", type: "resolved", pausesSla: true, sortOrder: 40, isDefault: false },
  { name: "Closed", type: "closed", pausesSla: true, sortOrder: 50, isDefault: false },
] as const;

export const SEED_PRIORITIES = [
  { name: "Low", level: 1, color: "#64748b", isDefault: false },
  { name: "Medium", level: 2, color: "#2563eb", isDefault: true },
  { name: "High", level: 3, color: "#d97706", isDefault: false },
  { name: "Urgent", level: 4, color: "#dc2626", isDefault: false },
];

export const SEED_CATEGORIES: { name: string; children: string[] }[] = [
  { name: "Hardware", children: ["Laptop", "Desktop", "Printer", "Peripherals"] },
  { name: "Software", children: ["Installation", "Licensing", "Bug or error"] },
  { name: "Network", children: ["Wi-Fi", "VPN", "Internet access"] },
  { name: "Accounts and access", children: ["Password reset", "New account", "Permissions"] },
  { name: "Email", children: [] },
];

/**
 * Inserts starter data on a fresh install. Each table is seeded only while it is empty, so
 * admins can rename or delete the defaults without them coming back.
 * No users are seeded: the first-run setup screen creates the first admin.
 */
export async function seed(prisma: PrismaClient): Promise<void> {
  if ((await prisma.department.count()) === 0) {
    await prisma.department.createMany({ data: SEED_DEPARTMENTS.map((name) => ({ name })) });
  }
  if ((await prisma.group.count()) === 0) {
    await prisma.group.createMany({ data: SEED_GROUPS });
  }
  if ((await prisma.status.count()) === 0) {
    await prisma.status.createMany({ data: SEED_STATUSES.map((s) => ({ ...s })) });
  }
  if ((await prisma.priority.count()) === 0) {
    await prisma.priority.createMany({ data: SEED_PRIORITIES });
  }
  if ((await prisma.category.count()) === 0) {
    for (const [i, c] of SEED_CATEGORIES.entries()) {
      await prisma.category.create({
        data: {
          name: c.name,
          sortOrder: (i + 1) * 10,
          children: { create: c.children.map((name, j) => ({ name, sortOrder: (j + 1) * 10 })) },
        },
      });
    }
  }
}
