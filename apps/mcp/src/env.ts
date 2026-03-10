import dotenv from "dotenv";
import path from "node:path";

// Load environment-specific .env file
const envFile =
  process.env.NODE_ENV === "production"
    ? ".env.production"
    : ".env.development";

dotenv.config({ path: path.resolve(import.meta.dirname, "..", envFile) });

const apiUrl = process.env.BANANA_SPLIT_API_URL;
const port = process.env.MCP_PORT ? parseInt(process.env.MCP_PORT, 10) : 8082;

if (!apiUrl) {
  console.error(
    "ERROR: BANANA_SPLIT_API_URL environment variable is required.\n" +
      "Set it in .env.development or .env.production"
  );
  process.exit(1);
}

export const env = {
  apiUrl,
  port,
} as const;
