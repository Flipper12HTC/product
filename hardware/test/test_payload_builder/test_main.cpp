#include <unity.h>
#include "messages/payloads.h"
#include <cstring>

void setUp()    {}
void tearDown() {}

void test_left_press_payload_contains_side_L() {
  char buf[256];
  size_t n = buildButtonPressPayload(ButtonSide::LEFT, 1000, buf, sizeof(buf));
  TEST_ASSERT_GREATER_THAN(0, n);
  TEST_ASSERT_NOT_NULL(strstr(buf, "\"side\":\"L\""));
}

void test_right_press_payload_contains_side_R() {
  char buf[256];
  buildButtonPressPayload(ButtonSide::RIGHT, 2000, buf, sizeof(buf));
  TEST_ASSERT_NOT_NULL(strstr(buf, "\"side\":\"R\""));
}

void test_payload_contains_event_press() {
  char buf[256];
  buildButtonPressPayload(ButtonSide::LEFT, 0, buf, sizeof(buf));
  TEST_ASSERT_NOT_NULL(strstr(buf, "\"event\":\"press\""));
}

void test_payload_contains_device_id() {
  char buf[256];
  buildButtonPressPayload(ButtonSide::LEFT, 0, buf, sizeof(buf));
  TEST_ASSERT_NOT_NULL(strstr(buf, "\"device_id\""));
}

void test_payload_contains_timestamp() {
  char buf[256];
  buildButtonPressPayload(ButtonSide::LEFT, 12345, buf, sizeof(buf));
  TEST_ASSERT_NOT_NULL(strstr(buf, "12345"));
}

int main(int argc, char** argv) {
  UNITY_BEGIN();
  RUN_TEST(test_left_press_payload_contains_side_L);
  RUN_TEST(test_right_press_payload_contains_side_R);
  RUN_TEST(test_payload_contains_event_press);
  RUN_TEST(test_payload_contains_device_id);
  RUN_TEST(test_payload_contains_timestamp);
  return UNITY_END();
}
