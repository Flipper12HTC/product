#include "gpio.h"
#include <Arduino.h>

namespace hal {

void configureInput(uint8_t pin, bool pullup) {
  pinMode(pin, pullup ? INPUT_PULLUP : INPUT);
}

bool readPin(uint8_t pin) {
  return digitalRead(pin) == HIGH;
}

} // namespace hal
