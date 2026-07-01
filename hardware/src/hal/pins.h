#pragma once
#include <cstdint>

// ─── Pins ───────────────────────────────────────────────
constexpr uint8_t PIN_BTN_LEFT  = 34;
constexpr uint8_t PIN_BTN_RIGHT = 35;
// TODO: add PIN_TILT and PIN_DRAIN when wired
// constexpr uint8_t PIN_TILT  = 32;
// constexpr uint8_t PIN_DRAIN = 33;

// ─── Debounce ───────────────────────────────────────────
constexpr uint16_t DEBOUNCE_MS = 15;

// ─── Device identity ────────────────────────────────────
constexpr const char* DEVICE_ID        = "flipper-01";
constexpr const char* FIRMWARE_VERSION = "0.1.0";

// ─── MQTT ───────────────────────────────────────────────
// Broker = the cabinet, reached over the FLIPHETIC_CAB0 Wi-Fi. The deploy
// publishes Mosquitto on host port 1883 (deploy/docker-compose.yml), so set
// this to the cabinet's IP on that network (the AP gateway). Keep 1883 unless
// the compose port mapping changes.
constexpr const char* MQTT_BROKER = "192.168.1.100";
constexpr uint16_t   MQTT_PORT   = 1883;

// ─── Heartbeat ──────────────────────────────────────────
constexpr uint32_t HEARTBEAT_INTERVAL_MS = 5000;
