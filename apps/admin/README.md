# Admin Scripts

This app contains administrative scripts for the Banana Split TMA project.

## Setup

1. Install dependencies from the project root:

   ```bash
   pnpm install
   ```

2. Copy the environment file:

   ```bash
   cp .env.example .env
   ```

3. Update the `.env` file with your TRPC server URL and API key.

## Running Scripts

### Method 1: Direct execution with tsx

```bash
npx tsx src/scripts/scriptName.ts
```

### Method 2: Using npm script (requires script parameter)

```bash
npm run script --script=scriptName
```

### Method 3: From project root with turbo

```bash
# From project root
cd apps/admin && npx tsx src/scripts/scriptName.ts
```

## Available Scripts

- `getAllChats.ts` - Fetches and displays all chats from the database

## Environment Variables

- `TRPC_URL` - The URL of your TRPC server
- `API_KEY` - API key for authentication

## Creating New Scripts

1. Create a new TypeScript file in `src/scripts/`
2. Import the TRPC client: `import { trpcClient } from "../utils/trpc.js"`
3. Use the client to make API calls
4. Handle errors appropriately
