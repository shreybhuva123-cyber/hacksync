import { defineEventHandler, setResponseHeaders } from "h3";
import { getProductionSecurityHeaders } from "@/lib/security/headers";

export default defineEventHandler((event) => {
  const headers = getProductionSecurityHeaders({
    supabaseUrl: process.env["VITE_SUPABASE_URL"],
    isProduction: process.env["NODE_ENV"] === "production",
  });

  setResponseHeaders(event, headers);
});
