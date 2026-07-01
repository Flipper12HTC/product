#pragma once
#include <cstdint>

namespace hal {

// Configure a pin as digital input. Set pullup = true for INPUT_PULLUP.
void configureInput(uint8_t pin, bool pullup = true);

// Read a digital pin. Returns true if HIGH.
bool readPin(uint8_t pin);

} // namespace hal
