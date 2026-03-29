/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TRPC_URL: string;
  readonly VITE_ADMIN_API_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
