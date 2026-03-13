# OpenCode GitHub Actions Setup Design

## Purpose

Set up GitHub Action workflows to automatically run the OpenCode agent in CI. This setup enables developers to trigger OpenCode on-demand via comments (for fixing issues or reviewing specific code lines) and provides automated reviews for all new or updated pull requests.

## Architecture & Workflows

We will split the implementation into two distinct workflow files to ensure clear separation of concerns, reduce condition complexity, and ensure proper context (prompts vs inline comment parsing) is passed to the OpenCode action.

### 1. On-Demand Mentions (`.github/workflows/opencode-mention.yml`)

- **Triggers**:
  - `issue_comment` (types: `[created]`)
  - `pull_request_review_comment` (types: `[created]`)
- **Execution Condition**: Runs only when the comment body contains `/oc` or `/opencode`.
- **Action Context**:
  - The workflow will pass the current context to OpenCode. OpenCode will automatically extract the user's instructions from the triggering comment.
  - Can create branches, apply fixes, and open or update PRs.
- **Permissions Required**: `id-token: write`, `contents: write`, `pull-requests: write`, `issues: write`

### 2. Automated PR Reviews (`.github/workflows/opencode-review.yml`)

- **Triggers**:
  - `pull_request` (types: `[opened, synchronize, reopened, ready_for_review]`)
- **Execution Condition**: Runs automatically on the aforementioned pull request events.
- **Action Context**:
  - A predefined `prompt` is passed to the `anomalyco/opencode/github@latest` action.
  - OpenCode is instructed to act as a code reviewer, checking for bugs, code quality, and offering improvement suggestions.
- **Permissions Required**: `id-token: write`, `contents: read`, `pull-requests: read`, `issues: read`

## Action Configuration Details

Both workflows will use the official OpenCode action:

- **Uses**: `anomalyco/opencode/github@latest`
- **Model**: `anthropic/claude-3-7-sonnet-20250219` (or the latest Sonnet version suitable for OpenCode)
- **Environment**:
  - `ANTHROPIC_API_KEY`: Must be stored in the repository's GitHub Actions Secrets.
  - `GITHUB_TOKEN`: Utilizes the standard `${{ secrets.GITHUB_TOKEN }}` available to GitHub runners, provided `use_github_token: true` is set if not using the App.

## Trade-offs

- **Cost**: Combining automated PR reviews with on-demand mentions will increase API usage compared to a purely on-demand approach, but greatly enhances code quality checks.
- **Security**: The workflow running on `issue_comment` has write access to the repository in order to branch and create pull requests on the user's behalf.
