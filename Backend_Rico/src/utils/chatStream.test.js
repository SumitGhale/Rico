import assert from "node:assert/strict";
import test from "node:test";
import {
  createScheduleStreamParser,
  createTaskLimiter,
  extractCompleteSentences,
} from "./chatStream.js";

test("streams visible text and hides schedule blocks split across chunks", () => {
  const parser = createScheduleStreamParser();

  assert.equal(parser.push("Okay. <SCHED"), "Okay. ");
  assert.equal(
    parser.push('ULE_READY>[{"title":"Gym"}]</SCHEDULE_RE'),
    ""
  );
  assert.equal(parser.push("ADY> Anything else?"), " Anything else?");
  assert.equal(parser.finish(), "");
});

test("matches the closing tag to the active opening tag", () => {
  const parser = createScheduleStreamParser();

  assert.equal(
    parser.push(
      "<SCHEDULE_READY>hidden</SCHEDULE_UPDATE>still hidden</SCHEDULE_READY>Visible"
    ),
    "Visible"
  );
});

test("supports multiple block types and visible text between them", () => {
  const parser = createScheduleStreamParser();

  assert.equal(
    parser.push(
      "Before<SCHEDULE_UPDATE>[]</SCHEDULE_UPDATE>Middle" +
        "<SCHEDULE_DELETE>[]</SCHEDULE_DELETE>After"
    ),
    "BeforeMiddleAfter"
  );
});

test("flushes an incomplete fake opening tag as visible text", () => {
  const parser = createScheduleStreamParser();

  assert.equal(parser.push("Okay <SCHED"), "Okay ");
  assert.equal(parser.finish(), "<SCHED");
});

test("keeps an incomplete active schedule block hidden", () => {
  const parser = createScheduleStreamParser();

  assert.equal(parser.push("Visible<SCHEDULE_READY>hidden"), "Visible");
  assert.equal(parser.finish(), "");
});

test("extracts complete sentences and retains incomplete text", () => {
  assert.deepEqual(
    extractCompleteSentences("First sentence. Second question? Third"),
    {
      complete: ["First sentence.", "Second question?"],
      remaining: " Third",
    }
  );
});

test("limits concurrent tasks", async () => {
  const limiter = createTaskLimiter(2);
  let activeCount = 0;
  let maximumActiveCount = 0;
  const resolvers = [];

  const tasks = [0, 1, 2].map(() =>
    limiter.run(
      () =>
        new Promise((resolve) => {
          activeCount += 1;
          maximumActiveCount = Math.max(maximumActiveCount, activeCount);
          resolvers.push(() => {
            activeCount -= 1;
            resolve();
          });
        })
    )
  );

  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(resolvers.length, 2);

  resolvers.shift()();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(resolvers.length, 2);

  while (resolvers.length > 0) {
    resolvers.shift()();
  }

  await Promise.all(tasks);
  assert.equal(maximumActiveCount, 2);
});
