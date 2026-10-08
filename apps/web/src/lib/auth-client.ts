import { twoFactorClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

// Browser-side client for /api/auth. Same origin, so no base URL is needed.
export const authClient = createAuthClient({
  plugins: [twoFactorClient()],
});
