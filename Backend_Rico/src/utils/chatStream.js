const SCHEDULE_BLOCKS = [
  {
    name: "SCHEDULE_READY",
    open: "<SCHEDULE_READY>",
    close: "</SCHEDULE_READY>",
  },
  {
    name: "SCHEDULE_UPDATE",
    open: "<SCHEDULE_UPDATE>",
    close: "</SCHEDULE_UPDATE>",
  },
  {
    name: "SCHEDULE_DELETE",
    open: "<SCHEDULE_DELETE>",
    close: "</SCHEDULE_DELETE>",
  },
];

function longestTagPrefixAtEnd(text, tags) {
  const maxLength = Math.min(
    text.length,
    Math.max(...tags.map((tag) => tag.length))
  );

  for (let length = maxLength; length > 0; length -= 1) {
    const suffix = text.slice(-length);
    if (tags.some((tag) => tag.startsWith(suffix))) {
      return length;
    }
  }

  return 0;
}

export function createScheduleStreamParser() {
  let pending = "";
  let activeBlock = null;

  function push(chunk) {
    pending += chunk;
    let visibleText = "";

    while (pending.length > 0) {
      if (!activeBlock) {
        const opening = SCHEDULE_BLOCKS
          .map((block) => ({
            block,
            index: pending.indexOf(block.open),
          }))
          .filter(({ index }) => index !== -1)
          .sort((left, right) => left.index - right.index)[0];

        if (opening) {
          visibleText += pending.slice(0, opening.index);
          pending = pending.slice(opening.index + opening.block.open.length);
          activeBlock = opening.block;
          continue;
        }

        const retainedLength = longestTagPrefixAtEnd(
          pending,
          SCHEDULE_BLOCKS.map((block) => block.open)
        );
        const safeLength = pending.length - retainedLength;

        visibleText += pending.slice(0, safeLength);
        pending = pending.slice(safeLength);
        break;
      }

      const closingIndex = pending.indexOf(activeBlock.close);
      if (closingIndex !== -1) {
        pending = pending.slice(closingIndex + activeBlock.close.length);
        activeBlock = null;
        continue;
      }

      const retainedLength = longestTagPrefixAtEnd(
        pending,
        [activeBlock.close]
      );
      pending = pending.slice(pending.length - retainedLength);
      break;
    }

    return visibleText;
  }

  function finish() {
    if (activeBlock) {
      pending = "";
      return "";
    }

    const visibleText = pending;
    pending = "";
    return visibleText;
  }

  return {
    push,
    finish,
  };
}

export function extractCompleteSentences(text) {
  const sentencePattern = /.*?[.!?]+(?:["'’”)\]]+)?(?=\s|$)/gs;
  const complete = [];
  let consumedLength = 0;

  for (const match of text.matchAll(sentencePattern)) {
    const sentence = match[0].trim();
    if (sentence) {
      complete.push(sentence);
    }
    consumedLength = (match.index ?? 0) + match[0].length;
  }

  return {
    complete,
    remaining: text.slice(consumedLength),
  };
}

export function createTaskLimiter(maxConcurrent) {
  if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1) {
    throw new Error("maxConcurrent must be a positive integer");
  }

  let activeCount = 0;
  const queue = [];

  function drain() {
    while (activeCount < maxConcurrent && queue.length > 0) {
      const item = queue.shift();
      activeCount += 1;

      Promise.resolve()
        .then(item.task)
        .then(item.resolve, item.reject)
        .finally(() => {
          activeCount -= 1;
          drain();
        });
    }
  }

  function run(task) {
    return new Promise((resolve, reject) => {
      queue.push({ task, resolve, reject });
      drain();
    });
  }

  return { run };
}
