# DKO Turborepo

A high-performance full-stack TypeScript monorepo powered by Turborepo, with TRPC, React, and Prisma.

## Overview

This repository leverages Turborepo to efficiently manage a modern monorepo architecture. Turborepo provides intelligent build caching, parallel execution, and optimized dependency management to significantly improve developer experience. The monorepo includes:

- **Frontend**: React application built with Vite
- **Backend**: Express.js server with TRPC API endpoints
- **Database**: PostgreSQL with Prisma ORM
- **Shared packages**: UI components, TRPC router, database client

## Repository Structure

```
dko-turbo-monorepo/
├── apps/                      # Application packages
│   ├── lambda/                # TRPC Express API server
│   └── web/                   # React frontend (Vite)
├── packages/                  # Shared internal packages
│   ├── database/              # Prisma client and schema
│   ├── eslint-config/         # Shared ESLint configurations
│   ├── trpc/                  # TRPC router definitions
│   ├── typescript-config/     # Shared TypeScript configurations
│   └── ui/                    # Shared React UI components
├── turbo.json                 # Turborepo configuration
└── ...                        # Root configuration files
```

## Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later)
- [PNPM](https://pnpm.io/) (v9.0.0 or later)
- [Docker](https://www.docker.com/) (for PostgreSQL database)
- [Turborepo](https://turbo.build/) installed globally

```bash
# Install Turborepo globally
npm install turbo -g
# or
pnpm add -g turbo
```

## Getting Started

### 1. Install dependencies

```bash
# Install all workspace dependencies
pnpm install

# Or, if you prefer to use npm
npm install
```

### 3. Set up environment variables

Create `.env` files for each project that requires them:

```bash
# For database package
cp packages/database/.env.example packages/database/.env

# For web app
cp apps/web/.env.example apps/web/.env
```

### 4. Start the database

```bash
# Start PostgreSQL using Docker
docker-compose up -d
```

### 5. Initialize the database

```bash
# Generate Prisma client
turbo db:generate

# Push the schema to the database
turbo db:push
```

### 6. Start the development servers

```bash
# Start all applications in development mode with Turborepo
turbo run dev
```

This command leverages Turborepo to intelligently start all services in the correct order with dependency awareness:

- The `lambda` TRPC API server on http://localhost:8081
- The `web` React frontend on http://localhost:5173

## Turborepo Development Workflows

### Running individual workspaces

```bash
# Run only the backend API server
turbo run lambda#dev

# Run both backend and frontend concurrently
turbo run lambda#dev web#dev
```

### Building with Turborepo

```bash
# Build all applications with Turborepo's parallel execution and caching
turbo run build
```

The build process benefits from Turborepo's intelligent caching, only rebuilding what has changed since the last build.

### Remote Caching (Optional)

To enable Turborepo's remote caching for team collaboration:

```bash
# Login to your Vercel account for remote caching
npx turbo login

# Link your project to enable remote caching
npx turbo link
```

### Linting and Type Checking

```bash
# Run linting across all packages in parallel
turbo run lint

# Type check all packages in parallel
turbo run check-types
```

## Working with Turborepo Commands

### Command Syntax

Turborepo offers multiple ways to run commands:

```bash
# Run a command across all workspaces
turbo run dev

# Run a specific command for a specific workspace
turbo run lambda#dev

# Run multiple specific commands
turbo run lambda#dev web#dev

# Build only what's changed since the last commit
turbo run build --filter=[HEAD^1]
```

The `workspace#task` syntax offers a concise way to target specific tasks in specific workspaces.

### Understanding Workspace-Specific Behavior

In a Turborepo monorepo, the same command can behave differently depending on the workspace:

| Command | In `web` workspace     | In `lambda` workspace           | In `ui` workspace                |
| ------- | ---------------------- | ------------------------------- | -------------------------------- |
| `build` | Runs Vite build        | Compiles TypeScript for Node.js | Creates component library bundle |
| `dev`   | Starts Vite dev server | Runs Express with nodemon       | Starts Storybook                 |
| `test`  | Runs Vitest            | Runs Jest                       | Runs component tests             |
| `lint`  | Lints React code       | Lints Node.js code              | Lints UI components              |

This variability is defined in each workspace's `package.json` scripts section, while the monorepo-wide orchestration is defined in `turbo.json`.

### How Turborepo Executes Commands

When you run a command like `turbo run build`:

1. Turborepo reads the `turbo.json` pipeline configuration
2. It determines the dependency order of workspaces
3. It executes the command in each workspace according to its `package.json` scripts
4. It caches the results for faster subsequent runs

For example, running `turbo run build` might:

- First build `packages/ui` since it has no dependencies
- Then build `packages/trpc` which depends on `packages/database`
- Finally build both apps simultaneously, since they can run in parallel

### Command Inheritance and Configuration

Tasks in Turborepo inherit configuration from the `turbo.json` file:

```json
{
  "$schema": "https://turbo.build/schema.json",
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**", "!.next/cache/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
```

In this configuration:

- The `build` task depends on the `build` task of all dependencies (the `^` prefix)
- The `dev` task runs in persistent mode and is never cached
- Different workspaces can implement these tasks differently in their own `package.json` files

### Visualizing the Dependency Graph

```bash
# Generate a visualization of your monorepo's dependency graph
turbo run build --graph
```

This will generate a visual representation of your build pipeline's dependency graph, which can be helpful for understanding the relationships between packages.

### Database Operations

```bash
# Generate Prisma client after schema changes
turbo run db:generate

# Push schema changes to database (development)
turbo run db:push

# Create a new migration
turbo run db:migrate

# Apply existing migrations (production)
turbo run db:deploy

# Reset the database (caution: this deletes all data)
turbo run db:reset
```

## Adding New Components to UI Package

```bash
cd packages/ui
turbo generate:component
```

## Project Configuration

### Turborepo Configuration

The `turbo.json` file in the project root defines the pipeline tasks that can be run across the monorepo:

```json
{
  "$schema": "https://turbo.build/schema.json",
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**", "!.next/cache/**"]
    },
    "lint": {},
    "dev": {
      "cache": false,
      "persistent": true
    },
    "db:generate": {
      "cache": false
    },
    "db:push": {
      "cache": false
    }
  }
}
```

This configuration ensures:

- Build tasks respect dependencies (libraries build before apps that use them)
- Development servers run in persistent mode
- Database operations are never cached

### TypeScript

The project uses TypeScript configurations that are extended from the base configs in `packages/typescript-config`.

### ESLint

ESLint configs are shared via `packages/eslint-config` to ensure consistent code style across all packages.

## API Testing

The TRPC API includes a built-in testing panel available in development mode:

1. Start the lambda server: `turbo run lambda#dev`
2. Navigate to http://localhost:8081/api/panel

## Deployment

### API Server (Lambda)

The API server can be deployed to Vercel or any other serverless platform:

```bash
# Build and deploy just the lambda package
turbo run lambda#build lambda#deploy
```

### Frontend (Web)

The web app can be built and deployed to your hosting provider of choice:

```bash
# Build and deploy just the web package
turbo run web#build web#deploy
```

### Turborepo Deployment Optimization

For CI/CD pipelines, Turborepo can significantly speed up deployments:

```bash
# Only build what's changed since the last deployment
turbo run build --filter=[HEAD^1]
```

## Troubleshooting

### Database Connection Issues

If you're having trouble connecting to the database:

1. Make sure Docker is running and the PostgreSQL container is up
2. Check your `.env` file in `packages/database` has the correct connection string
3. Verify the database name, username, and password match what's in `docker-compose.yaml`

### TRPC Connection Issues

If the web app cannot connect to the TRPC API:

1. Ensure the TRPC server is running
2. Check that the `VITE_TRPC_URL` environment variable in the web app points to the correct API URL
3. Verify network connectivity between frontend and backend

### Turborepo Cache Issues

If you suspect cache-related problems:

1. Clear the local Turborepo cache: `npx turbo clean`
2. Verify that `.turbo` is in your `.gitignore`
3. Ensure your CI environment correctly handles Turborepo caching

## License

[MIT](LICENSE)
