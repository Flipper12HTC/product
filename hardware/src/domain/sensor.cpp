#include "sensor.h"
#include "../hal/pins.h"

SensorState sensorInit(SensorType type) {
  SensorState s;
  s.type = type;
  return s;
}

SensorEvent sensorUpdate(SensorState& state, bool rawValue, uint32_t nowMs) {
  // TODO: implement debounce / hysteresis for tilt sensor
  // TODO: implement drain detection logic
  (void)nowMs;

  if (rawValue != state.lastDebounced) {
    state.lastDebounced = rawValue;
    state.lastChangeMs  = nowMs;
    return rawValue ? SensorEvent::TRIGGERED : SensorEvent::CLEARED;
  }

  return SensorEvent::NONE;
}
