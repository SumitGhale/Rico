import assert from "node:assert/strict";
import test from "node:test";
import {
  getRecommendedDurationFromPreferences,
  groupByCategory,
} from "./recommendationLogic.js";

test("groups newest-first preferences by category without changing their order", () => {
  const preferences = [
    { category: "exercise", duration: 75 },
    { category: "study", duration: 90 },
    { category: "exercise", duration: 60 },
  ];

  assert.deepEqual(groupByCategory(preferences), {
    exercise: [
      { category: "exercise", duration: 75 },
      { category: "exercise", duration: 60 },
    ],
    study: [{ category: "study", duration: 90 }],
  });
});

test("uses the newest duration when fewer than five preferences exist", () => {
  const preferences = [
    { duration: 75 },
    { duration: 60 },
    { duration: 60 },
  ];

  assert.equal(getRecommendedDurationFromPreferences(preferences), 75);
});

test("uses the duration mode when five preferences exist", () => {
  const preferences = [
    { duration: 75 },
    { duration: 60 },
    { duration: 60 },
    { duration: 45 },
    { duration: 60 },
  ];

  assert.equal(getRecommendedDurationFromPreferences(preferences), 60);
});

test("returns null when a category has no preferences", () => {
  assert.equal(getRecommendedDurationFromPreferences([]), null);
});
