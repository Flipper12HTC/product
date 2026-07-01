/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GAME_SOURCE?: 'mock' | 'ws';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
