# Flipper 12 — Frontend

Stack de rendu 3D pour le projet de flipper Flipper 12. Trois applis Vite pilotées par un backend via WebSocket. Le frontend est un renderer passif : il ne calcule jamais la physique, il se contente de réagir à des événements typés.

## Stack

- **pnpm** monorepo
- **Vite 5** + **TypeScript** (strict)
- **Three.js** (vanilla, sans framework UI)
- **Tailwind CSS v4**
- **ESLint** + **Prettier**
- **Playwright** (e2e)

## Applications

| Appli                   | Port | Rôle                         | Fréquence    |
| ----------------------- | ---- | ---------------------------- | ------------ |
| `@flipper/front-screen` | 3000 | Plateau 3D principal         | 60 Hz        |
| `@flipper/back-screen`  | 3001 | Tableau de score (DOM)       | 1 Hz         |
| `@flipper/deco-screen`  | 3002 | Effets ambiants (particules) | event-driven |

## Packages

| Package                  | Rôle                                                           |
| ------------------------ | -------------------------------------------------------------- |
| `@flipper/contracts`     | DTOs wire, union `GameEvent`, ports `GameSource` / `InputSink` |
| `@flipper/game-sources`  | Implémentations `WsGameSource` + `MockGameSource`              |
| `@flipper/ws-client`     | Client WebSocket minimal avec reconnexion                      |
| `@flipper/design-system` | Tokens Tailwind                                                |
| `@flipper/mock-backend`  | Serveur WS mock local (dev uniquement)                         |

## Architecture

Chaque appli suit une Clean Architecture avec dépendances à sens unique (de l'extérieur vers l'intérieur) :

```
apps/<app>/src/
├── domain/          types purs, invariants, dérivations
├── application/
│   ├── ports/       GameSource, InputSink
│   └── renderer-orchestrator.ts
├── infrastructure/  implémentations des ports (DOM, WS, clavier)
├── adapters/        rendu (three, DOM, Tailwind)
└── main.ts          composition root
```

Règles imposées dans `eslint.config.ts` :

- `domain/` n'importe rien sauf `@flipper/contracts`.
- `application/` importe `domain/` + `@flipper/contracts` uniquement. Pas de `three`, pas de DOM.
- `infrastructure/` implémente les ports, peut utiliser des libs externes.
- `adapters/` peut utiliser `three` et le DOM librement.
- `main.ts` câble tout à la main ; c'est le seul fichier qui instancie un `GameSource` concret.

## Démarrage

```bash
pnpm install
```

Lancer une seule appli :

```bash
pnpm dev:front   # front-screen sur :3000
pnpm dev:back    # back-screen sur :3001
pnpm dev:deco    # deco-screen sur :3002
```

Lancer les trois en parallèle :

```bash
pnpm dev:all
```

Lancer le backend mock local + toutes les applis :

```bash
pnpm dev:standalone
```

## Choix de la source d'événements

Chaque appli choisit sa `GameSource` au démarrage via `VITE_GAME_SOURCE` :

| Valeur | Comportement                                                      |
| ------ | ----------------------------------------------------------------- |
| `mock` | Ticks synthétiques depuis `MockGameSource` (défaut en `vite dev`) |
| `ws`   | WebSocket réel via `WsGameSource` (défaut en `vite build`)        |

Surcharge ponctuelle :

```bash
VITE_GAME_SOURCE=ws pnpm dev:front
```

## Scripts

| Commande              | Rôle                                              |
| --------------------- | ------------------------------------------------- |
| `pnpm dev`            | Alias pour `dev:front`                            |
| `pnpm dev:all`        | Toutes les applis en parallèle                    |
| `pnpm dev:standalone` | Backend mock + toutes les applis                  |
| `pnpm build`          | Build de tous les workspaces                      |
| `pnpm typecheck`      | `tsc --noEmit` sur tout le monorepo               |
| `pnpm lint`           | ESLint (inclut la règle de frontière clean archi) |
| `pnpm lint:fix`       | ESLint avec `--fix`                               |
| `pnpm format`         | Prettier write                                    |
| `pnpm format:check`   | Prettier check                                    |

## Conventions

- Noms de fichiers : `kebab-case`
- Types / classes : `PascalCase`
- Variables / fonctions : `camelCase`
- Pas de `any` ; préférer `unknown` et narrow
- Pas de `console.log` ; utiliser le logger par appli si besoin
- Les formes des événements wire viennent de `@flipper/contracts` ; jamais redéclarés dans une appli

## Hors périmètre

- Backend, hardware et code produit vivent dans des repos voisins et ne sont pas édités ici.
- Aucun moteur physique côté frontend. Le backend fait autorité.
- Aucun appel MQTT ou Solana depuis le frontend.

## Arborescence

```
Frontend/
├── apps/
│   ├── front-screen/
│   ├── back-screen/
│   └── deco-screen/
├── packages/
│   ├── contracts/
│   ├── game-sources/
│   ├── ws-client/
│   │   └── mock/          serveur WS mock local
│   └── design-system/
├── eslint.config.ts
├── tsconfig.base.json
└── pnpm-workspace.yaml
```
