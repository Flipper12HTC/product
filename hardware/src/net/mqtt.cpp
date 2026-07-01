#include "mqtt.h"
#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include "../hal/pins.h"
#include "../messages/payloads.h"

static WiFiClient   s_wifiClient;
static PubSubClient s_mqtt(s_wifiClient);
static uint32_t     s_lastHeartbeatMs = 0;
static uint32_t     s_lastReconnectMs = 0;

// Topics — must match backend subscription (pinball/+/input/button) and the
// contract in hardware/contracts/README.md.
static String inputTopic()  { return String("pinball/") + DEVICE_ID + "/input/button"; }
static String statusTopic() { return String("pinball/") + DEVICE_ID + "/status"; }

void setupMqtt() {
  s_mqtt.setBufferSize(256);
}

// Broker host = the Wi-Fi gateway. On the cabinet the ESP joins FLIPHETIC_CAB0,
// whose AP is the cabinet itself, and Mosquitto is published on that host at
// :1883 — so the gateway IP is always the broker. This needs no hard-coded IP.
// MQTT_BROKER in hal/pins.h is only a fallback when there is no gateway.
static IPAddress brokerAddress() {
  IPAddress gw = WiFi.gatewayIP();
  if (static_cast<uint32_t>(gw) != 0) return gw;
  IPAddress fallback;
  fallback.fromString(MQTT_BROKER);
  return fallback;
}

void ensureMqttConnected() {
  if (WiFi.status() != WL_CONNECTED) return; // need Wi-Fi (and a gateway) first
  if (s_mqtt.connected()) return;

  // Non-blocking: one attempt every 2 s so a missing broker never freezes the
  // button loop (buttons still register locally over serial).
  const uint32_t now = millis();
  if (now - s_lastReconnectMs < 2000) return;
  s_lastReconnectMs = now;

  const IPAddress broker = brokerAddress();
  s_mqtt.setServer(broker, MQTT_PORT);

  Serial.print("[MQTT] connecting to ");
  Serial.print(broker);
  Serial.print(":");
  Serial.println(MQTT_PORT);

  const String clientId = String("flipper12-hw-") + DEVICE_ID;
  if (s_mqtt.connect(clientId.c_str())) {
    Serial.println("[MQTT] connected");
  } else {
    Serial.print("[MQTT] connect failed, rc=");
    Serial.println(s_mqtt.state());
  }
}

void mqttLoop() {
  s_mqtt.loop();
}

void publishHeartbeat() {
  const uint32_t now = millis();
  if (now - s_lastHeartbeatMs < HEARTBEAT_INTERVAL_MS) return;
  s_lastHeartbeatMs = now;
  if (!s_mqtt.connected()) return;

  char buf[128];
  const int n = snprintf(
    buf, sizeof(buf),
    "{\"device_id\":\"%s\",\"firmware\":\"%s\",\"uptime_ms\":%lu}",
    DEVICE_ID, FIRMWARE_VERSION, static_cast<unsigned long>(now));
  if (n > 0) s_mqtt.publish(statusTopic().c_str(), buf);
}

static void publishButton(ButtonSide side, const char* event, uint32_t nowMs) {
  if (!s_mqtt.connected()) return;
  char buf[192];
  const size_t n = buildButtonPayload(side, event, nowMs, buf, sizeof(buf));
  if (n > 0) s_mqtt.publish(inputTopic().c_str(), buf);
}

void publishButtonPress(ButtonSide side, uint32_t nowMs) {
  publishButton(side, "press", nowMs);
}

void publishButtonRelease(ButtonSide side, uint32_t nowMs) {
  publishButton(side, "release", nowMs);
}
