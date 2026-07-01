# flipper12-backend

Central nervous system of **Flipper 12**: game engine, MQTT bridge, WebSocket gateway, persistence, and Solana integration.

See `flipper12-product` for the full project spec, CDC, and backlog.

## Stack

- Node.js 20+ / TypeScript strict
- Fastify + @fastify/websocket
- MQTT (`mqtt`, broker Mosquitto via Docker)
- Rapier (`@dimforge/rapier3d-compat`) pour la physique
- PostgreSQL (`postgres` by porsager) + Redis (`ioredis`)
- Native Node test runner (`node --test`)

## Prerequisites

- Node.js >= 20
- npm >= 10
- Docker Desktop (for Mosquitto, Postgres, Redis)

## Quick start

```powershell
npm install
npm run docker:up
npm run dev
```

You should see startup logs. No real server yet — this is a skeleton.

## Scripts

- `npm run dev` — mode dev avec rechargement auto
- `npm run build` — compilation TypeScript vers `dist/`
- `npm start` — lance la version compilée
- `npm run typecheck` — vérif des types sans emit
- `npm test` — tests via le test runner natif Node
- `npm run format` — formatage avec Prettier
- `npm run docker:up` — démarre Mosquitto, Postgres, Redis en arrière-plan
- `npm run docker:down` — stoppe les services Docker

## Docker (dev)

Les trois services (Mosquitto, PostgreSQL, Redis) sont définis dans `docker/docker-compose.yml`.

```bash
# Démarrer les services en arrière-plan
npm run docker:up

# Vérifier que tout est healthy
docker compose -f docker/docker-compose.yml ps

# Stopper les services
npm run docker:down
```

- Les données Postgres persistent entre `up`/`down` grâce au volume nommé `pgdata`.
- Pour repartir de zéro : `docker compose -f docker/docker-compose.yml down -v` (supprime le volume).
- Le broker Mosquitto autorise les connexions anonymes (dev uniquement, voir `docker/mosquitto.conf`).

## Structure

```
src/
├── domain/           Entités pures — aucune dépendance externe
├── application/
│   ├── ports/        Interfaces (PhysicsWorld, GamePublisher, etc.)
│   └── use-cases/    Logique métier injectée via les ports
├── infrastructure/   Implémentations concrètes (Rapier, MQTT, WS, Postgres, Solana)
├── interfaces/
│   └── http/         Routes Fastify, gateway WebSocket
└── main.ts           Composition root — seul fichier qui instancie l'infra

contracts/        DTOs réseau partagés (MQTT / WS / REST shapes)
tests/            Tests unitaires (mocks manuels) + intégration
scripts/          Utilitaires de dev
docker/           docker-compose.yml et config Mosquitto
```

## Architecture

Le backend suit **Clean Architecture** en 4 couches concentriques :

| Couche            | Contenu                                           | Peut importer                        |
| ----------------- | ------------------------------------------------- | ------------------------------------ |
| `domain/`         | Entités, types métier purs                        | Rien                                 |
| `application/`    | Ports (interfaces) + use cases                    | `domain/` uniquement                 |
| `infrastructure/` | Rapier, MQTT, Fastify WS, Postgres, Redis, Solana | `application/ports/` + `domain/`     |
| `interfaces/`     | Routes HTTP, gateway WS                           | `application/use-cases/` + `domain/` |

**Règle absolue :** `domain/` et `application/` n'importent jamais de framework (Fastify, Rapier, MQTT…). Tout passe par les ports. `src/main.ts` est le seul endroit où les classes concrètes sont instanciées et injectées.

Vérification : `npm run depcheck`.
