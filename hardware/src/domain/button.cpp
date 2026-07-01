#include "button.h"
#include "../hal/pins.h"

ButtonState buttonInit(ButtonSide side) {
  ButtonState s;
  s.side = side;
  return s;
}

ButtonEvent buttonUpdate(ButtonState& state, bool rawValue, uint32_t nowMs) {
  if (rawValue != state.lastRaw) {
    state.lastRaw      = rawValue;
    state.lastChangeMs = nowMs;
    return ButtonEvent::NONE;
  }

  if ((nowMs - state.lastChangeMs) < DEBOUNCE_MS) {
    return ButtonEvent::NONE;
  }

  if (rawValue != state.lastDebounced) {
    state.lastDebounced = rawValue;
    // INPUT_PULLUP: LOW = pressed, HIGH = released
    return rawValue ? ButtonEvent::RELEASE : ButtonEvent::PRESS;
  }

  return ButtonEvent::NONE;
}
