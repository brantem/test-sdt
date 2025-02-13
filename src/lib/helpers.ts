export function isValidTimezone(timeZone: string | undefined) {
  if (!Intl || !Intl.DateTimeFormat().resolvedOptions().timeZone) {
    throw new Error("Time zones are not available in this environment");
  }

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

export async function processInBatches<T>(arr: T[], n: number, cb: (arr: T[]) => Promise<void>) {
  if (!arr.length || n <= 0) return;
  for (let i = 0; i < arr.length; i += n) {
    await cb(arr.slice(i, i + n));
  }
}
