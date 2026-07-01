#pragma once
#include <cstddef>
#include <cstdint>
#include "../domain/button.h"

// Fills buffer with a JSON button event payload for the given event string
// ("press" or "release"). Returns the number of bytes written.
size_t buildButtonPayload(ButtonSide side, const char* event, uint32_t timestampMs,
                          char* buffer, size_t bufferSize);

// Convenience: a "press" event. Kept for backward compatibility / unit tests.
size_t buildButtonPressPayload(ButtonSide side, uint32_t timestampMs,
                               char* buffer, size_t bufferSize);
