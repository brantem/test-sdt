export function isValidTimezone(timeZone: string | undefined) {
  try {
    Intl.DateTimeFormat(undefined, { timeZone });
    return true;
  } catch {
    return false;
  }
}

export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// at any given time, there will be at most n items being processed simultaneously. when an item finishes processing, a
// new item is pulled from the queue to maintain the concurrency level until all items are processed.
export async function runConcurrently<Item extends { id: any }>(
  items: Item[],
  concurrency: number,
  cb: {
    onProcess: (item: Item) => Promise<any>;
    onFail?: (item: Item) => void;
    onSuccess?: (item: Item) => void;
  }
) {
  const queue = [...items]; // avoid mutating the original
  const processing = new Map<Item["id"], Promise<void>>();

  // continue while there are items to process or items still processing
  while (queue.length > 0 || processing.size > 0) {
    // fill processing
    while (processing.size < concurrency && queue.length > 0) {
      const item = queue.shift()!;

      const promise = cb
        .onProcess(item)
        .then(() => cb.onSuccess?.(item))
        .catch(() => cb.onFail?.(item)) // if this doesnt exists, finally won't run
        .finally(() => processing.delete(item.id));
      processing.set(item.id, promise);
    }

    // If there are items processing, wait for at least one to complete
    if (processing.size > 0) await Promise.race(Array.from(processing.values()));
  }
}
