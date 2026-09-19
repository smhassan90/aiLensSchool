type RuntimeWithAnimationFrame = typeof globalThis & {
  requestAnimationFrame?: (callback: (timestamp: number) => void) => unknown;
  cancelAnimationFrame?: (handle: unknown) => void;
};

const runtime = globalThis as RuntimeWithAnimationFrame;

if (typeof runtime.requestAnimationFrame !== 'function') {
  runtime.requestAnimationFrame = (callback) =>
    setTimeout(() => callback(Date.now()), 16);
}

if (typeof runtime.cancelAnimationFrame !== 'function') {
  runtime.cancelAnimationFrame = (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>);
}
