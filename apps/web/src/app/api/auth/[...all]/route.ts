import { authHandler } from "@petey/core";

export const dynamic = "force-dynamic";

export const GET = (request: Request) => authHandler(request);
export const POST = (request: Request) => authHandler(request);
