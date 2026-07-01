# flipper12-hardware

ESP32 firmware for the Flipper 12 physical arcade machine.
Reads buttons and sensors, applies software debounce, and publishes
events to the MQTT broker consumed by the game engine.

See `flipper12-product` for the full spec, CDC, and backlog.

## Role

The ESP32 is a **spine, not a brain**:

- Reads GPIO pins (left/right buttons, tilt, drain)
- Applies software debounce
- Publishes events on `pinball/<device_id>/input/...` via MQTT
- Publishes a heartbeat on `pinball/<device_id>/status` every 5s

No game logic, no score, no game state. The backend decides everything.

## Stack

- ESP32 + PlatformIO + Arduino framework
- C++17
- PubSubClient (MQTT)
- ArduinoJson v7
- Unity (native unit tests — no hardware needed)

## Prerequisites

- PlatformIO Core (VS Code extension or `pipx install platformio`)
- ESP32 DevKitC + USB cable (only needed to flash)

## Setup

```bash
# Copy secrets template and fill in your WiFi credentials
cp src/secrets.h.example src/secrets.h
# Edit src/secrets.h with your real SSID and password
```

## Commands

```bash
# Compile for ESP32 (no board needed)
pio run

# Flash to a connected ESP32
pio run --target upload

# Open serial monitor
pio device monitor

# Run unit tests without hardware
pio test -e native

# Format code
clang-format -i src/**/*.cpp src/**/*.h
```

## Structure

```
src/
├── main.cpp              # Composition root: init + loop dispatch only
├── secrets.h             # Gitignored — real WiFi credentials (DO NOT COMMIT)
├── secrets.h.example     # Template with placeholders
├── domain/
│   ├── button.h / .cpp   # Debounce state machine — no Arduino.h
│   └── sensor.h / .cpp   # Tilt / drain logic — no Arduino.h
├── hal/
│   ├── pins.h            # Pin numbers + domain constants
│   └── gpio.h / .cpp     # ONLY file calling digitalRead / pinMode
├── net/
│   ├── wifi.h / .cpp     # wifiConnect() + wifiEnsureConnected()
│   └── mqtt.h / .cpp     # MQTT client (PubSubClient wrapper)
└── messages/
    └── payloads.h / .cpp # ArduinoJson payload builders (native-testable)

test/
├── test_button_debounce/ # Unity — debounce state machine
├── test_payload_builder/ # Unity — JSON payload correctness
└── test_sensor_logic/    # Unity — tilt / drain state machine

contracts/                # MQTT schemas synced from flipper12-backend
docs/                     # Wiring diagram, flashing guide
```

### Separation rules

| Layer | Rule |
|-------|------|
| `domain/` | No `Arduino.h`, no `WiFi.h`, no `PubSubClient.h`. Compiles under `native` env. |
| `hal/gpio.*` | **Only** file calling `digitalRead`, `digitalWrite`, `pinMode`. |
| `net/` | Only place importing `WiFi.h`, `PubSubClient.h`. |
| `messages/` | ArduinoJson only — compiles under `native` env. |
| `main.cpp` | Orchestration only — no inline protocol or WiFi logic. |

## Contracts sync

MQTT schemas are copied from `backend/contracts/mqtt/` at a pinned version.

**Current pinned backend SHA:** `<SHA_PLACEHOLDER>`

To update:
```bash
cp backend/contracts/mqtt/* hardware/contracts/
# Update the SHA in this file and in contracts/README.md
```
