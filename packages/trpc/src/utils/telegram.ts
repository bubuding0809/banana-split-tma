/**
 * Telegram helper utilities
 * TypeScript implementation of python-telegram-bot helpers
 */

// Types
export type MarkdownVersion = 1 | 2;

// Custom error class to match Python's ValueError
export class ValueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValueError";
  }
}

// Constants
export const MessageLimit = {
  DEEP_LINK_LENGTH: 64,
} as const;

/**
 * Helper function to escape telegram markup symbols.
 *
 * @param text - The text to escape
 * @param version - Use to specify the version of telegrams Markdown. Either 1 or 2. Defaults to 1.
 * @param entityType - For specific entity types, only certain characters need to be escaped in Markdown V2
 * @returns The escaped text
 */
export function escapeMarkdown(
  text: string,
  version: MarkdownVersion = 1,
  entityType?: string
): string {
  let escapeChars: string;

  if (version === 1) {
    escapeChars = "_*`[";
  } else if (version === 2) {
    if (entityType === "pre" || entityType === "code") {
      escapeChars = "`";
    } else if (entityType === "text_link" || entityType === "custom_emoji") {
      escapeChars = ")";
    } else {
      escapeChars = "_*[]()~`>#+-=|{}.!";
    }
  } else {
    throw new ValueError("Markdown version must be either 1 or 2!");
  }

  // Create regex pattern - escape special regex characters in escapeChars
  const escapedChars = escapeChars.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`([${escapedChars}])`, "g");

  return text.replace(regex, "\\$1");
}

/**
 * Helper function to create a user mention as HTML tag.
 *
 * @param userId - The user's id which you want to mention
 * @param name - The name the mention is showing
 * @returns The inline mention for the user as HTML
 */
export function mentionHtml(userId: number | string, name: string): string {
  // HTML escape function equivalent to Python's html.escape()
  const escapedName = name
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");

  return `<a href="tg://user?id=${userId}">${escapedName}</a>`;
}

/**
 * Helper function to create a user mention in Markdown syntax.
 *
 * @param userId - The user's id which you want to mention
 * @param name - The name the mention is showing
 * @param version - Use to specify the version of Telegram's Markdown. Either 1 or 2. Defaults to 1.
 * @returns The inline mention for the user as Markdown
 */
export function mentionMarkdown(
  userId: number | string,
  name: string,
  version: MarkdownVersion = 1
): string {
  const tgLink = `tg://user?id=${userId}`;

  if (version === 1) {
    return `[${name}](${tgLink})`;
  }

  return `[${escapeMarkdown(name, version)}](${tgLink})`;
}

/**
 * Creates a deep-linked URL for a bot with the specified payload.
 *
 * @param botUsername - The username to link to
 * @param payload - Parameters to encode in the created URL (optional)
 * @param group - If true, prompts user to select a group to add the bot to. Defaults to false.
 * @returns An URL to start the bot with specific parameters
 * @throws Error if bot_username is invalid, payload is too long, or contains invalid characters
 */
export function createDeepLinkedUrl(
  botUsername: string,
  payload?: string,
  group: boolean = false
): string {
  if (!botUsername || botUsername.length <= 3) {
    throw new ValueError("You must provide a valid bot_username.");
  }

  const baseUrl = `https://t.me/${botUsername}`;

  if (!payload) {
    return baseUrl;
  }

  if (payload.length > MessageLimit.DEEP_LINK_LENGTH) {
    throw new ValueError(
      `The deep-linking payload must not exceed ${MessageLimit.DEEP_LINK_LENGTH} characters. ${payload} has ${payload.length} characters.`
    );
  }

  if (!/^[A-Za-z0-9_-]+$/.test(payload)) {
    throw new ValueError(
      "Only the following characters are allowed for deep-linked URLs: A-Z, a-z, 0-9, _ and -"
    );
  }

  const key = group ? "startgroup" : "start";
  return `${baseUrl}?${key}=${payload}`;
}
