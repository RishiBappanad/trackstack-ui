/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TRACKSTACK_AUTH_URL?: string;
  readonly VITE_TODO_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
