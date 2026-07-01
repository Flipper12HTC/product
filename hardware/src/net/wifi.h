#pragma once

// Connect to WiFi. Blocks until connected.
void wifiConnect(const char* ssid, const char* password);

// Re-connect if the WiFi link dropped. Call every loop iteration.
void wifiEnsureConnected();
