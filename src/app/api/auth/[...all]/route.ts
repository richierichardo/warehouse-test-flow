import { handleAuthRequest } from "@/lib/auth-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export {
  handleAuthRequest as GET,
  handleAuthRequest as POST,
  handleAuthRequest as HEAD,
  handleAuthRequest as OPTIONS,
  handleAuthRequest as PUT,
  handleAuthRequest as PATCH,
  handleAuthRequest as DELETE,
};
