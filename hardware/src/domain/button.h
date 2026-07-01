#pragma once
#include <cstdint>

enum class ButtonSide  : uint8_t { LEFT, RIGHT };
enum class ButtonEvent : uint8_t { NONE, PRESS, RELEASE };

struct ButtonState {
  ButtonSide side;
  bool       lastRaw       = true;  // INPUT_PULLUP → idle = HIGH
  bool       lastDebounced = true;
  uint32_t   lastChangeMs  = 0;
};

ButtonState buttonInit(ButtonSide side);
ButtonEvent buttonUpdate(ButtonState& state, bool rawValue, uint32_t nowMs);
