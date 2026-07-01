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

| id              | GPIO | physical      | role |
|-----------------|------|---------------|------|
| `R2`            | 25   | white right   | left flipper |
| `L1`            | 4    | white left    | right flipper |
| `L2`            | 16   | black left    | start |
| `R1`            | 13   | black right   | restart |
| `under_plunger` | 33   | front white   | launch the ball (hold longer = stronger) |
| `top`           | 17   | green         | unused |
| `middle`        | 18   | yellow        | unused |
| `bottom`        | 19   | red           | unused |
| plunger         | 32   | plunger       | launch (own topic; physical plunger unused) |
