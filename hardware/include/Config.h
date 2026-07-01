#pragma once

// Build-time configuration. Real values are supplied by platformio.ini (and, for
// the Wi-Fi password, by CI via a build flag). Empty fallbacks keep a bare
// `pio run` compiling — it just won't join Wi-Fi.
#ifndef WIFI_SSID
#define WIFI_SSID ""
#endif
#ifndef WIFI_PASSWORD
#define WIFI_PASSWORD ""
#endif
#ifndef DEVICE_ID
#define DEVICE_ID "flipper-cabinet"
#endif
#ifndef MQTT_BROKER_PORT
#define MQTT_BROKER_PORT 1883
#endif
// Empty → resolve the broker as the Wi-Fi gateway at runtime (the cabinet hosts
// the AP, so its gateway is the machine running Mosquitto). Set a literal IP
// only for off-cabinet testing.
#ifndef MQTT_BROKER_HOST
#define MQTT_BROKER_HOST ""
#endif

// Input topics — the contract the backend subscribes to (pinball/+/input/#).
#define TOPIC_BUTTONS "pinball/" DEVICE_ID "/input/button"
#define TOPIC_PLUNGER "pinball/" DEVICE_ID "/input/plunger"

// Debounce window applied to every button, in milliseconds.
#define DEBOUNCE_MS 40

// Milliseconds between MQTT reconnection attempts while the link is down.
#define MQTT_RETRY_MS 2000
