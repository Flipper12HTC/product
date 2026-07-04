#pragma once

#include <Arduino.h>
#include <cstdint>

// Edge reported by DebouncedButton::poll() for the current call.
enum class Edge : uint8_t { None, Down, Up };

// A momentary button wired between a GPIO and GND, read with the internal
// pull-up (idle = HIGH, pressed = LOW). poll() is edge-triggered: it returns
// Down once when the debounced level settles to pressed, Up once when it
// settles back to released. Distinct edges matter — a flipper must stay raised
// for as long as the button is held.
class DebouncedButton {
 public:
  explicit DebouncedButton(uint8_t gpio, uint16_t debounceMs);

  void attach();            // configure the pin and seed the current level
  Edge poll(uint32_t nowMs);
  bool pressed() const { return pressed_; }

 private:
  uint8_t  gpio_;
  uint16_t debounce_;
  bool     pressed_;     // debounced, stable level (true = pressed)
  bool     lastSample_;  // most recent raw reading
  uint32_t sampledAt_;   // when lastSample_ last changed
};
