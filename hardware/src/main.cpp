// Flipper 12 — physical input board.
//
// Reads the cabinet's arcade buttons + plunger and publishes each edge over
// MQTT. The board carries no game logic: it reports "input <id> is now
// pressed/released" and the backend decides what that means.
//
//   pinball/<DEVICE_ID>/input/button   {"id":"L1","state":1,"ts":<ms>}
//   pinball/<DEVICE_ID>/input/plunger  {"state":1,"ts":<ms>}
//
// state = 1 on press, 0 on release. Config comes from platformio.ini / CI.

#include <Arduino.h>
#include <ArduinoJson.h>
#include <PubSubClient.h>
#include <WiFi.h>

#include "Button.h"
#include "Config.h"

namespace {

// GPIO → published id. Pin numbers follow the cabinet's wiring; they are
// pull-up-capable GPIOs (avoid the input-only pins 34-39, which have none).
struct Binding {
  DebouncedButton button;
  const char* id;
};

Binding g_inputs[] = {
    {DebouncedButton(4, DEBOUNCE_MS), "L1"},             // left flipper
    {DebouncedButton(13, DEBOUNCE_MS), "R1"},            // right flipper
    {DebouncedButton(16, DEBOUNCE_MS), "L2"},            // nav left
    {DebouncedButton(25, DEBOUNCE_MS), "R2"},            // nav right
    {DebouncedButton(17, DEBOUNCE_MS), "top"},           // start
    {DebouncedButton(18, DEBOUNCE_MS), "middle"},        // secondary
    {DebouncedButton(19, DEBOUNCE_MS), "bottom"},        // back / pause
    {DebouncedButton(33, DEBOUNCE_MS), "under_plunger"}, // front white
};

DebouncedButton g_plunger(32, DEBOUNCE_MS);

WiFiClient g_net;
PubSubClient g_mqtt(g_net);
uint32_t g_lastMqttTry = 0;

// --- MQTT publish ----------------------------------------------------------

void sendJson(const char* topic, const JsonDocument& doc) {
  char payload[96];
  const size_t len = serializeJson(doc, payload, sizeof(payload));
  g_mqtt.publish(topic, reinterpret_cast<const uint8_t*>(payload), len);
}

void sendButton(const char* id, uint8_t state) {
  JsonDocument doc;
  doc["id"] = id;
  doc["state"] = state;
  doc["ts"] = millis();
  sendJson(TOPIC_BUTTONS, doc);
  Serial.printf("[input] %s -> %u\n", id, state);
}

void sendPlunger(uint8_t state) {
  JsonDocument doc;
  doc["state"] = state;
  doc["ts"] = millis();
  sendJson(TOPIC_PLUNGER, doc);
  Serial.printf("[input] plunger -> %u\n", state);
}

// --- Connectivity ----------------------------------------------------------

IPAddress resolveBroker() {
  // A literal host wins (off-cabinet testing); otherwise the broker is the
  // Wi-Fi gateway — on the cabinet that AP gateway is the machine hosting
  // Mosquitto. A Tailscale IP would be unreachable from the ESP's Wi-Fi.
  IPAddress host;
  if (host.fromString(MQTT_BROKER_HOST)) return host;
  return WiFi.gatewayIP();
}

void keepWifiUp() {
  if (WiFi.status() == WL_CONNECTED) return;
  Serial.print("[wifi] joining ");
  Serial.println(WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(400);
    Serial.print('.');
  }
  Serial.printf("\n[wifi] up, ip=%s\n", WiFi.localIP().toString().c_str());
}

// Non-blocking: one attempt per MQTT_RETRY_MS so a missing broker never stalls
// the input loop.
void keepMqttUp(uint32_t nowMs) {
  if (g_mqtt.connected()) return;
  if (nowMs - g_lastMqttTry < MQTT_RETRY_MS) return;
  g_lastMqttTry = nowMs;

  const IPAddress broker = resolveBroker();
  g_mqtt.setServer(broker, MQTT_BROKER_PORT);
  Serial.printf("[mqtt] connecting %s:%d ... ", broker.toString().c_str(), MQTT_BROKER_PORT);
  if (g_mqtt.connect(DEVICE_ID)) {
    Serial.println("ok");
  } else {
    Serial.printf("rc=%d\n", g_mqtt.state());
  }
}

}  // namespace

void setup() {
  Serial.begin(921600);
  delay(200);

  if (strlen(WIFI_SSID) == 0) {
    // Config was not injected — say so loudly instead of failing silently.
    for (;;) {
      Serial.println("[fatal] WIFI_SSID not set (see platformio.ini / README)");
      delay(2000);
    }
  }

  for (Binding& b : g_inputs) b.button.attach();
  g_plunger.attach();

  keepWifiUp();
  g_mqtt.setBufferSize(256);
  keepMqttUp(millis());

  Serial.println("[ready]");
}

void loop() {
  const uint32_t now = millis();
  keepWifiUp();
  keepMqttUp(now);
  g_mqtt.loop();

  for (Binding& b : g_inputs) {
    const Edge edge = b.button.poll(now);
    if (edge != Edge::None) sendButton(b.id, edge == Edge::Down ? 1 : 0);
  }

  const Edge plunger = g_plunger.poll(now);
  if (plunger != Edge::None) sendPlunger(plunger == Edge::Down ? 1 : 0);
}
