export function withRateLimit(delayMs: number) {
  let chain: Promise<unknown> = Promise.resolve();
  return <A extends unknown[], R>(fn: (...args: A) => Promise<R>) => {
    return (...args: A): Promise<R> => {
      const next = chain.then(async () => {
        const result = await fn(...args);
        await new Promise((r) => setTimeout(r, delayMs));
        return result;
      });
      chain = next.catch(() => undefined);
      return next as Promise<R>;
    };
  };
}
