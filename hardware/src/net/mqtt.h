#pragma once
#include <cstdint>
#include "../domain/button.h"

// Configure the MQTT client (broker host/port from hal/pins.h). Call once in setup().
void setupMqtt();

// Non-blocking: (re)connect to the broker if the link is down. Throttled
// internally so it never stalls the main loop. Call every loop iteration.
void ensureMqttConnected();

// Service the MQTT client (keepalive, outgoing buffer). Call every loop.
void mqttLoop();

// Publish a heartbeat on pinball/<device_id>/status, at most every
// HEARTBEAT_INTERVAL_MS. Call every loop.
void publishHeartbeat();

// Publish a button event on pinball/<device_id>/input/button.
void publishButtonPress(ButtonSide side, uint32_t nowMs);
void publishButtonRelease(ButtonSide side, uint32_t nowMs);
