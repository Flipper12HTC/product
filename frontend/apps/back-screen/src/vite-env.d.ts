/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GAME_SOURCE?: 'mock' | 'ws';
  readonly VITE_BACKEND_URL?: string;
  readonly VITE_WS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
