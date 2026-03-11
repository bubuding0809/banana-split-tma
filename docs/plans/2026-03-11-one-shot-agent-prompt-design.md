# 2026-03-11 One-Shot Agent Prompt Design

## Context

Users currently need to manually run multiple commands to install and configure the `@banananasplitz/cli` tool and its Agent Skill. The goal is to streamline this setup process by providing a "one-shot" setup prompt when they generate an access token in the Banana Split Web App settings.

## Design

### UI Flow

The change will be made in `apps/web/src/components/features/Settings/AccessTokensSection.tsx`.

When a user generates a new token:

1. The New Access Token modal opens.
2. The modal prominently displays the "One-Shot Agent Prompt", containing a conversational block of text for AI agents.
3. The raw token is also displayed underneath or alongside the prompt for users who just need the token itself.

### The Agent Prompt Template

The text provided to the user will be:

```text
Hey agent, please install and configure the Banana Split CLI for this project:
1. Run `npm install -g @banananasplitz/cli`
2. Run `banana login --api-key <INSERT_ACTUAL_TOKEN_HERE>`
3. Install the skill by evaluating `banana install-skill`, extracting the `skill_path` from the JSON, and copying that directory into your skills folder.
4. Confirm you can read the skill, then run `banana list-expenses` to verify the connection.
```

### Interactions

- **Copy Agent Prompt**: A primary button that copies the entire prompt block to the clipboard.
- **Copy Token Only**: A secondary button or click-to-copy element that copies only the raw API token.

## Technical Details

- Extract the text generation to a local constant or state.
- Update the layout in the `Modal` returned by `AccessTokensSection.tsx`.
- Use the existing theme configuration and `lucide-react` icons (e.g., `Copy`, `Check`, `Terminal`) for visual feedback.
