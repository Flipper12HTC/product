#include "payloads.h"
#include <ArduinoJson.h>
#include "../hal/pins.h"

size_t buildButtonPayload(ButtonSide side, const char* event, uint32_t timestampMs,
                          char* buffer, size_t bufferSize) {
  JsonDocument doc;
  doc["device_id"]    = DEVICE_ID;
  doc["side"]         = (side == ButtonSide::LEFT) ? "L" : "R";
  doc["timestamp_ms"] = timestampMs;
  doc["event"]        = event;

  return serializeJson(doc, buffer, bufferSize);
}

size_t buildButtonPressPayload(ButtonSide side, uint32_t timestampMs,
                               char* buffer, size_t bufferSize) {
  return buildButtonPayload(side, "press", timestampMs, buffer, bufferSize);
}
