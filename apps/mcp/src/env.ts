const apiUrl = process.env.BANANA_SPLIT_API_URL;
const apiKey = process.env.BANANA_SPLIT_API_KEY;

if (!apiUrl) {
  console.error(
    "ERROR: BANANA_SPLIT_API_URL environment variable is required.\n" +
      "Set it to your API's tRPC endpoint, e.g. https://your-api.com/api/trpc"
  );
  process.exit(1);
}

if (!apiKey) {
  console.error(
    "ERROR: BANANA_SPLIT_API_KEY environment variable is required.\n" +
      "Set it to your API key for the Banana Split API."
  );
  process.exit(1);
}

export const env = {
  apiUrl,
  apiKey,
} as const;
