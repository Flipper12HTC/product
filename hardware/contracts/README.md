# MQTT contract (firmware ↔ backend)

The ESP32 firmware is game-agnostic: it just reports which physical input was
pressed or released. The backend (`backend/src/infrastructure/mqtt/`) maps ids
to game roles.

## Topics (device → backend)

| Topic                                 | Payload                                  |
|---------------------------------------|------------------------------------------|
| `pinball/<device_id>/input/button`    | `{ "id": "L1", "state": 1, "ts": 1234 }` |
| `pinball/<device_id>/input/plunger`   | `{ "state": 1, "ts": 1234 }`             |

- `state`: `1` on press, `0` on release (a flipper stays up while held).
- `<device_id>` comes from the `DEVICE_ID` build flag (`platformio.ini`); the
  backend subscribes `pinball/+/input/#`, so any device id matches.

## Button ids → game role (decided by the backend)

| id                | GPIO    | role |
|-------------------|---------|------|
| `L1`              | 4       | left flipper |
| `R1`              | 13      | right flipper |
| `top`             | 17      | start game |
| `L2` / `R2`       | 16 / 25 | navigation (unused for now) |
| `middle` / `bottom` | 18 / 19 | unused for now |
| `under_plunger`   | 33      | unused for now |
| plunger           | 32      | launch ball (own topic) |
