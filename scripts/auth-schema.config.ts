import "dotenv/config";
import { betterAuth } from "better-auth";
import { authOptions } from "../src/lib/auth-options";

export const auth = betterAuth({
  ...authOptions,
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
});
