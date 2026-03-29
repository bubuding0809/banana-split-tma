# Deployment Setup Instructions

This document provides instructions for setting up the GitHub Actions orchestrated CD pipeline for the Banana Split TMA.

## GitHub Actions Secrets

To enable the automated deployment pipeline, you need to configure the following Repository Secrets in your GitHub repository (`Settings` > `Secrets and variables` > `Actions`):

1. **`DATABASE_URL`**: The connection string for your production PostgreSQL database. This is required for the `migrate` job to run Prisma migrations automatically when the schema changes.

2. **`VERCEL_TOKEN`**: A personal access token from your Vercel account.

   - Go to Vercel > Account Settings > Tokens.
   - Create a new token with appropriate permissions.

3. **`VERCEL_ORG_ID`**: Your Vercel organization ID or personal account ID.

   - This can be found in your Vercel Account Settings, or by running `vercel link` locally and checking the generated `.vercel/project.json` file.

4. **`VERCEL_PROJECT_ID_LAMBDA`**: The Vercel Project ID for the `apps/lambda` application.

   - Create a project on Vercel for this app, or link it locally to retrieve the ID.

5. **`VERCEL_PROJECT_ID_WEB`**: The Vercel Project ID for the `apps/web` application.

6. **`VERCEL_PROJECT_ID_BOT`**: The Vercel Project ID for the `apps/bot` application.

## Pipeline Behavior

The `.github/workflows/deploy.yml` pipeline orchestrates the entire CD process:

1. **Path Filtering (`filter` job)**: Determines which parts of the monorepo have changed.

   - `db`: Detects changes in `packages/database/prisma/schema.prisma`.
   - `lambda`: Detects changes in `apps/lambda` or `packages/`.
   - `web`: Detects changes in `apps/web` or `packages/`.
   - `bot`: Detects changes in `apps/bot` or `packages/`.

2. **Database Migrations (`migrate` job)**:

   - Runs conditionally **only** if `schema.prisma` was modified.
   - Executes `pnpm --filter database db:deploy` against your production database using the provided `DATABASE_URL` secret.

3. **Parallel App Deployments (`deploy-*` jobs)**:
   - Evaluates whether `lambda`, `web`, or `bot` require deployment based on the path filter.
   - All three deployment jobs **depend** on the `migrate` job (`needs: [filter, migrate]`), ensuring that if a database schema change was pushed, the apps will not deploy until the migration succeeds.
   - They deploy in parallel to Vercel using the Vercel CLI.

## Troubleshooting

- **Migrations failing**: Ensure `DATABASE_URL` matches your production instance and that the database is accessible from GitHub Actions runners.
- **Deployments skipped unexpectedly**: Verify that the changed files fall under the path filters specified in the workflow. Note that any changes inside `packages/**` will trigger a deployment for all three apps to ensure shared code updates are propagated.
- **Vercel authentication errors**: Check that your `VERCEL_TOKEN` is valid and hasn't expired, and verify your ORG and PROJECT IDs.
