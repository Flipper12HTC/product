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

// GPIO each input is wired to (see contracts/README.md). All pull-up-capable
// pins — the input-only pins 34-39 have no internal pull-up.
#define PIN_BTN_L1 4
#define PIN_BTN_R1 13
#define PIN_BTN_L2 16
#define PIN_BTN_R2 25
#define PIN_BTN_TOP 17
#define PIN_BTN_MIDDLE 18
#define PIN_BTN_BOTTOM 19
#define PIN_BTN_UNDER_PLUNGER 33
#define PIN_PLUNGER 32

// Debounce window applied to every button, in milliseconds.
#define DEBOUNCE_MS 40

// Milliseconds between MQTT reconnection attempts while the link is down.
#define MQTT_RETRY_MS 2000
