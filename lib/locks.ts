// Promise-chain based mutex locks (per-key, single Node.js process)
// Prevents race conditions on concurrent stock/transaction operations

const productLocks = new Map<string, Promise<unknown>>();
const txLocks = new Map<string, Promise<unknown>>();
const userPurchaseLocks = new Map<string, Promise<unknown>>();

function withLock<T>(
  lockMap: Map<string, Promise<unknown>>,
  key: string,
  fn: () => T | Promise<T>
): Promise<T> {
  const prev = lockMap.get(key) || Promise.resolve();
  const next = prev.then(() => fn(), () => fn());
  lockMap.set(key, next);
  next.finally(() => {
    if (lockMap.get(key) === next) lockMap.delete(key);
  });
  return next;
}

export function withProductLock<T>(productName: string, fn: () => T | Promise<T>): Promise<T> {
  return withLock(productLocks, productName.toLowerCase(), fn);
}

export function withTxLock<T>(txKey: string, fn: () => T | Promise<T>): Promise<T> {
  return withLock(txLocks, txKey, fn);
}

export function withUserPurchaseLock<T>(chatId: string | number, fn: () => T | Promise<T>): Promise<T> {
  return withLock(userPurchaseLocks, String(chatId), fn);
}
