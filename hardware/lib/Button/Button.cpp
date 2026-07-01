#include "Button.h"

DebouncedButton::DebouncedButton(uint8_t gpio, uint16_t debounceMs)
    : gpio_(gpio), debounce_(debounceMs), pressed_(false), lastSample_(false), sampledAt_(0) {}

void DebouncedButton::attach() {
  pinMode(gpio_, INPUT_PULLUP);
  // Seed from the live level so we don't emit a phantom edge at boot.
  const bool level = digitalRead(gpio_) == LOW;
  pressed_ = level;
  lastSample_ = level;
  sampledAt_ = millis();
}

Edge DebouncedButton::poll(uint32_t nowMs) {
  const bool sample = digitalRead(gpio_) == LOW;

  // Restart the debounce timer whenever the raw reading flips.
  if (sample != lastSample_) {
    lastSample_ = sample;
    sampledAt_ = nowMs;
    return Edge::None;
  }

  // Reading has been steady long enough and differs from the accepted state:
  // commit it and report the edge.
  if (sample != pressed_ && (nowMs - sampledAt_) >= debounce_) {
    pressed_ = sample;
    return pressed_ ? Edge::Down : Edge::Up;
  }

  return Edge::None;
}
