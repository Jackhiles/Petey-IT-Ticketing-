import { getPrisma } from "../src/index";
import { seed } from "../src/seed";

const prisma = getPrisma();
await seed(prisma);
await prisma.$disconnect();
console.log("Seed complete");
