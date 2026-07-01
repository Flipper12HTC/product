#include <unity.h>
#include "domain/button.h"

void setUp()    {}
void tearDown() {}

void test_initial_state_is_idle() {
  ButtonState s = buttonInit(ButtonSide::LEFT);
  TEST_ASSERT_EQUAL(true,  s.lastRaw);
  TEST_ASSERT_EQUAL(true,  s.lastDebounced);
  TEST_ASSERT_EQUAL(0,     s.lastChangeMs);
}

void test_no_event_before_debounce_period() {
  ButtonState s = buttonInit(ButtonSide::LEFT);
  // Simulate pin going LOW (pressed) at t=0
  ButtonEvent ev = buttonUpdate(s, false, 0);
  TEST_ASSERT_EQUAL(ButtonEvent::NONE, ev);
  // Still within debounce window
  ev = buttonUpdate(s, false, 10);
  TEST_ASSERT_EQUAL(ButtonEvent::NONE, ev);
}

void test_press_event_after_debounce() {
  ButtonState s = buttonInit(ButtonSide::LEFT);
  // Pin goes LOW at t=0 — records change
  buttonUpdate(s, false, 0);
  // After debounce period — should emit PRESS
  ButtonEvent ev = buttonUpdate(s, false, 20);
  TEST_ASSERT_EQUAL(ButtonEvent::PRESS, ev);
}

void test_release_event_after_press() {
  ButtonState s = buttonInit(ButtonSide::LEFT);
  buttonUpdate(s, false, 0);
  buttonUpdate(s, false, 20); // PRESS
  // Pin goes HIGH (released)
  buttonUpdate(s, true, 21);
  ButtonEvent ev = buttonUpdate(s, true, 50);
  TEST_ASSERT_EQUAL(ButtonEvent::RELEASE, ev);
}

void test_no_duplicate_press() {
  ButtonState s = buttonInit(ButtonSide::LEFT);
  buttonUpdate(s, false, 0);
  buttonUpdate(s, false, 20); // PRESS
  ButtonEvent ev = buttonUpdate(s, false, 40);
  TEST_ASSERT_EQUAL(ButtonEvent::NONE, ev);
}

int main(int argc, char** argv) {
  UNITY_BEGIN();
  RUN_TEST(test_initial_state_is_idle);
  RUN_TEST(test_no_event_before_debounce_period);
  RUN_TEST(test_press_event_after_debounce);
  RUN_TEST(test_release_event_after_press);
  RUN_TEST(test_no_duplicate_press);
  return UNITY_END();
}
