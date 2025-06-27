/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TRPC_URL: string;
  readonly VITE_TELEGRAM_BOT_DEEP_LINK: string;
  // more env variables...
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
