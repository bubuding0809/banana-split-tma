export type TelegramHtmlTag = {
  name: string;
  openTag: string;
  closeTag: string;
};

const TELEGRAM_SELF_CLOSING_HTML_TAGS = new Set(["br"]);
const HTML_TAG_PATTERN = /(<\/?)([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*?>/gi;

function buildTelegramHtmlOpenPrefix(tags: TelegramHtmlTag[]): string {
  return tags.map((tag) => tag.openTag).join("");
}

function buildTelegramHtmlCloseSuffix(tags: TelegramHtmlTag[]): string {
  return tags
    .slice()
    .reverse()
    .map((tag) => tag.closeTag)
    .join("");
}

function buildTelegramHtmlCloseSuffixLength(tags: TelegramHtmlTag[]): number {
  return tags.reduce((total, tag) => total + tag.closeTag.length, 0);
}

function findTelegramHtmlEntityEnd(text: string, start: number): number {
  if (text[start] !== "&") return -1;
  let index = start + 1;
  if (index >= text.length) return -1;
  if (text[index] === "#") {
    index += 1;
    if (index >= text.length) return -1;
    const isHex = text[index] === "x" || text[index] === "X";
    if (isHex) {
      index += 1;
      const hexStart = index;
      while (/[0-9A-Fa-f]/.test(text[index] ?? "")) index += 1;
      if (index === hexStart) return -1;
    } else {
      const digitStart = index;
      while (/[0-9]/.test(text[index] ?? "")) index += 1;
      if (index === digitStart) return -1;
    }
  } else {
    const nameStart = index;
    while (/[A-Za-z0-9]/.test(text[index] ?? "")) index += 1;
    if (index === nameStart) return -1;
  }
  return text[index] === ";" ? index : -1;
}

function findTelegramHtmlSafeSplitIndex(
  text: string,
  maxLength: number
): number {
  if (text.length <= maxLength) return text.length;
  const normalizedMaxLength = Math.max(1, Math.floor(maxLength));
  const lastAmpersand = text.lastIndexOf("&", normalizedMaxLength - 1);
  if (lastAmpersand === -1) return normalizedMaxLength;

  const lastSemicolon = text.lastIndexOf(";", normalizedMaxLength - 1);
  if (lastAmpersand < lastSemicolon) return normalizedMaxLength;

  const entityEnd = findTelegramHtmlEntityEnd(text, lastAmpersand);
  if (entityEnd === -1 || entityEnd < normalizedMaxLength)
    return normalizedMaxLength;

  return lastAmpersand;
}

function popTelegramHtmlTag(tags: TelegramHtmlTag[], name: string): void {
  for (let index = tags.length - 1; index >= 0; index -= 1) {
    if (tags[index]?.name === name) {
      tags.splice(index, 1);
      return;
    }
  }
}

/**
 * Splits an HTML string into chunks of a given maximum length while ensuring that
 * HTML tags are not broken across chunks. Open tags at the end of a chunk are
 * closed, and re-opened at the beginning of the next chunk.
 */
export function splitTelegramHtmlChunks(
  html: string,
  limit: number = 4000
): string[] {
  if (!html) return [];
  const normalizedLimit = Math.max(1, Math.floor(limit));
  if (html.length <= normalizedLimit) return [html];

  const chunks: string[] = [];
  const openTags: TelegramHtmlTag[] = [];
  let current = "";
  let chunkHasPayload = false;

  const resetCurrent = () => {
    current = buildTelegramHtmlOpenPrefix(openTags);
    chunkHasPayload = false;
  };

  const flushCurrent = () => {
    if (!chunkHasPayload) return;
    chunks.push(`${current}${buildTelegramHtmlCloseSuffix(openTags)}`);
    resetCurrent();
  };

  const appendText = (segment: string) => {
    let remaining = segment;
    while (remaining.length > 0) {
      const available =
        normalizedLimit -
        current.length -
        buildTelegramHtmlCloseSuffixLength(openTags);

      if (available <= 0) {
        if (!chunkHasPayload) {
          throw new Error(
            `Telegram HTML chunk limit exceeded by tag overhead (limit=${normalizedLimit})`
          );
        }
        flushCurrent();
        continue;
      }

      if (remaining.length <= available) {
        current += remaining;
        chunkHasPayload = true;
        break;
      }

      const splitAt = findTelegramHtmlSafeSplitIndex(remaining, available);
      if (splitAt <= 0) {
        if (!chunkHasPayload) {
          throw new Error(
            `Telegram HTML chunk limit exceeded by leading entity (limit=${normalizedLimit})`
          );
        }
        flushCurrent();
        continue;
      }

      current += remaining.slice(0, splitAt);
      chunkHasPayload = true;
      remaining = remaining.slice(splitAt);
      flushCurrent();
    }
  };

  resetCurrent();
  HTML_TAG_PATTERN.lastIndex = 0;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = HTML_TAG_PATTERN.exec(html)) !== null) {
    const tagStart = match.index;
    const tagEnd = HTML_TAG_PATTERN.lastIndex;

    // Add text before the tag
    if (tagStart > lastIndex) {
      appendText(html.slice(lastIndex, tagStart));
    }

    const rawTag = match[0]!;
    const isClosing = match[1] === "</";
    const tagName = match[2]!.toLowerCase();
    const isSelfClosing =
      !isClosing &&
      (TELEGRAM_SELF_CLOSING_HTML_TAGS.has(tagName) ||
        rawTag.trimEnd().endsWith("/>"));

    // If we're opening a tag, see if we have room for it and its closing tag
    if (!isClosing) {
      const nextCloseLength = isSelfClosing ? 0 : `</${tagName}>`.length;
      if (
        chunkHasPayload &&
        current.length +
          rawTag.length +
          buildTelegramHtmlCloseSuffixLength(openTags) +
          nextCloseLength >
          normalizedLimit
      ) {
        flushCurrent();
      }
    }

    current += rawTag;
    if (isSelfClosing) chunkHasPayload = true;

    if (isClosing) {
      popTelegramHtmlTag(openTags, tagName);
    } else if (!isSelfClosing) {
      openTags.push({
        name: tagName,
        openTag: rawTag,
        closeTag: `</${tagName}>`,
      });
    }
    lastIndex = tagEnd;
  }

  // Add any remaining text after the last tag
  if (lastIndex < html.length) {
    appendText(html.slice(lastIndex));
  }
  flushCurrent();

  return chunks.length > 0 ? chunks : [html];
}
