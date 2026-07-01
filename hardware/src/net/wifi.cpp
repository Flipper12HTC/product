#include "wifi.h"
#include <Arduino.h>
#include <WiFi.h>

static const char* s_ssid     = nullptr;
static const char* s_password = nullptr;

void wifiConnect(const char* ssid, const char* password) {
  s_ssid     = ssid;
  s_password = password;

  Serial.print("[WiFi] Connecting to ");
  Serial.print(ssid);
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.print(" connected — IP: ");
  Serial.println(WiFi.localIP());
}

void wifiEnsureConnected() {
  if (WiFi.status() == WL_CONNECTED) return;
  Serial.println("[WiFi] Connection lost — reconnecting...");
  wifiConnect(s_ssid, s_password);
}
