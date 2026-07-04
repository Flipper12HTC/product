# flipper12-hardware

ESP32 firmware for the cabinet's physical buttons. It reads the arcade buttons
and the plunger, debounces them, and publishes each press/release over MQTT to
the broker the backend consumes.

The ESP32 is a **spine, not a brain**: no game logic. It just says "input `L1`
went to state 1"; the backend decides what that means (see `contracts/`).

## Stack

- ESP32 + PlatformIO + Arduino framework, C++17
- PubSubClient (MQTT) + ArduinoJson v7
- Debounced `Button` helper in `lib/Button/`

## Contract

Publishes on:

- `pinball/<device_id>/input/button` → `{ "id": "L1", "state": 1, "ts": 1234 }`
- `pinball/<device_id>/input/plunger` → `{ "state": 1, "ts": 1234 }`

`state` is `1` on press, `0` on release. Ids and their GPIO / game role are in
[`contracts/README.md`](contracts/README.md). `L1` = left flipper, `R2` = right
flipper, `L2` = start, `R1` = restart, `under_plunger` = launch.

## Broker & Wi-Fi

- The firmware joins the cabinet Wi-Fi (`FLIPHETIC_CAB0`) and targets the **Wi-Fi
  gateway** as the MQTT broker — the cabinet hosts the AP, so its gateway *is*
  the broker (Mosquitto, published on host `:1883`). No broker IP to hard-code.
  Force one with `-DMQTT_BROKER_HOST='"x.x.x.x"'` if ever needed.
- `WIFI_SSID`, `DEVICE_ID`, `MQTT_BROKER_PORT` are set in `platformio.ini`
  (non-secret). `WIFI_PASSWORD` is **never** in source: CI injects it from the
  `WIFI_PASSWORD` repo secret as a build flag (see `.github/workflows/firmware.yml`).

## Build / flash

The cabinet flashes a prebuilt binary; it never compiles. CI builds and commits
`firmware/build/firmware.bin` on any change under `hardware/`, and the manifest's
`[esp32.esp32]` block flashes it at Load.

```bash
# Local build (Wi-Fi won't connect without a password):
pio run -e esp32dev
# Local build WITH a password + flash to a connected board:
PLATFORMIO_BUILD_FLAGS='-DWIFI_PASSWORD="<real-pass>"' pio run -e esp32dev -t upload
# Serial monitor (WiFi/MQTT/button logs):
pio device monitor
```

## Structure

```
platformio.ini          board + libs + non-secret build flags
include/Config.h         pins, timings, MQTT topics
lib/Button/              debounced INPUT_PULLUP button (poll() → Edge::Down/Up)
src/main.cpp             wire each GPIO → button id, connect Wi-Fi + MQTT, loop
firmware/build/          CI-committed merged binary the cabinet flashes
contracts/               the MQTT contract shared with the backend
```

## Wiring

Each button connects its GPIO to `GND`; the firmware enables the internal
pull-up (`INPUT_PULLUP`), so pressed = LOW. Pins are in `include/Config.h`
(`L1`=4, `R1`=13, …). Use pull-up-capable GPIOs — the input-only pins 34-39 have
no internal pull-up and would need external resistors.
