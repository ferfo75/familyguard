import test from "node:test";
import assert from "node:assert/strict";
import { shouldWake } from "./wake";

const NOW = Date.parse("2026-11-22T20:00:00Z");
const ago = (min: number) => new Date(NOW - min * 60_000);

test("despierta solo si hace más de 25 minutos que no reporta", () => {
  assert.equal(shouldWake({ fcmToken: "t", lastSeenAt: ago(10), lastWakeAt: null }, NOW), false);
  assert.equal(shouldWake({ fcmToken: "t", lastSeenAt: ago(26), lastWakeAt: null }, NOW), true);
});

test("sin token no hay a quién despertar", () => {
  assert.equal(shouldWake({ fcmToken: null, lastSeenAt: ago(600), lastWakeAt: null }, NOW), false);
});

test("no insiste antes de 20 minutos del último aviso", () => {
  assert.equal(shouldWake({ fcmToken: "t", lastSeenAt: ago(90), lastWakeAt: ago(5) }, NOW), false);
  assert.equal(shouldWake({ fcmToken: "t", lastSeenAt: ago(90), lastWakeAt: ago(21) }, NOW), true);
});

test("un hijo que nunca reportó se despierta, y a los 2 días se deja de insistir", () => {
  assert.equal(shouldWake({ fcmToken: "t", lastSeenAt: null, lastWakeAt: null }, NOW), true);
  assert.equal(shouldWake({ fcmToken: "t", lastSeenAt: ago(60 * 49), lastWakeAt: null }, NOW), false);
});
