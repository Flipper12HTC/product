#pragma once
#include <cstdint>

enum class SensorType  : uint8_t { TILT, DRAIN };
enum class SensorEvent : uint8_t { NONE, TRIGGERED, CLEARED };

struct SensorState {
  SensorType type;
  bool       lastDebounced = false;
  uint32_t   lastChangeMs  = 0;
  // TODO: add threshold / count for tilt debounce if needed
};

SensorState sensorInit(SensorType type);

// rawValue: true = sensor active (e.g. tilt triggered, ball in drain)
// TODO: implement full debounce / hysteresis for tilt
SensorEvent sensorUpdate(SensorState& state, bool rawValue, uint32_t nowMs);
