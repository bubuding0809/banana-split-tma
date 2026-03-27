declare module "telegramify-markdown" {
  export default function telegramifyMarkdown(
    markdown: string,
    escape?: "escape" | "remove"
  ): string;
}
