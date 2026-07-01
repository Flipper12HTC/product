#pragma once
#include <cstddef>
#include <cstdint>
#include "../domain/button.h"

// Fills buffer with a JSON button press payload.
// Returns the number of bytes written.
size_t buildButtonPressPayload(ButtonSide side, uint32_t timestampMs,
                               char* buffer, size_t bufferSize);
