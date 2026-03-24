export function escapeMarkdownV2(text: string): string {
  // Telegram MarkdownV2 requires escaping these characters:
  // _ * [ ] ( ) ~ ` > # + - = | { } . ! \
  return text.replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
}
