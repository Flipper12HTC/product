# MQTT Contracts

This directory contains MQTT message schemas shared between `flipper12-hardware` and `flipper12-backend`.

## Sync strategy

Schemas are copied from `backend/contracts/mqtt/` with a pinned version marker.

**Current pinned backend version:** `<SHA_PLACEHOLDER>` — update this when syncing.

## How to sync

```bash
# From the monorepo root:
cp backend/contracts/mqtt/* hardware/contracts/
# Then update the SHA placeholder above with:
git -C backend rev-parse HEAD
```

## Topics

| Topic                                  | Direction         | Schema file             |
|----------------------------------------|-------------------|-------------------------|
| `pinball/<device_id>/input/button`     | hardware → backend | `button_press.json`    |
| `pinball/<device_id>/status`           | hardware → backend | `heartbeat.json`       |

> **Note:** If schema files are not yet present, run the sync command above after the backend contracts are defined.
