# OpenCode GitHub Actions Setup Implementation Plan

> **For OpenCode:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Set up GitHub Actions for OpenCode to review PRs automatically and respond to /oc mentions.

**Architecture:** Create two distinct GitHub action workflows (`opencode-mention.yml` and `opencode-review.yml`) in the `.github/workflows/` directory.

**Tech Stack:** GitHub Actions, YAML

---

### Task 1: Create the On-Demand Mention Workflow

**Files:**

- Create: `.github/workflows/opencode-mention.yml`

**Step 1: Write the workflow file**
Create `.github/workflows/opencode-mention.yml` with the following content:

```yaml
name: OpenCode Mention

on:
  issue_comment:
    types: [created]
  pull_request_review_comment:
    types: [created]

jobs:
  opencode:
    if: |
      contains(github.event.comment.body, '/oc') ||
      contains(github.event.comment.body, '/opencode')
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: write
      pull-requests: write
      issues: write
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 1
          persist-credentials: false

      - name: Run OpenCode
        uses: anomalyco/opencode/github@latest
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          model: anthropic/claude-3-7-sonnet-20250219
          use_github_token: true
```

**Step 2: Commit**

```bash
git add .github/workflows/opencode-mention.yml
git commit -m "ci: add OpenCode mention workflow"
```

---

### Task 2: Create the Automated PR Review Workflow

**Files:**

- Create: `.github/workflows/opencode-review.yml`

**Step 1: Write the workflow file**
Create `.github/workflows/opencode-review.yml` with the following content:

```yaml
name: OpenCode PR Review

on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review]

jobs:
  review:
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: read
      pull-requests: read
      issues: read
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          persist-credentials: false

      - name: Run OpenCode
        uses: anomalyco/opencode/github@latest
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          model: anthropic/claude-3-7-sonnet-20250219
          use_github_token: true
          prompt: |
            Review this pull request:
            - Check for code quality issues
            - Look for potential bugs
            - Suggest improvements
```

**Step 2: Commit**

```bash
git add .github/workflows/opencode-review.yml
git commit -m "ci: add automated OpenCode PR review workflow"
```
