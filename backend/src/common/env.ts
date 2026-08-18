/** Runtime env lookup that bundlers should not replace at build time. */
export function readEnv(name: string): string | undefined {
  const value = process['env'][name];
  if (value === undefined || value === '') return undefined;
  return value;
}

export function requireEnv(name: string): string {
  const value = readEnv(name);
  if (!value) {
    throw new Error(
      `Missing ${name}. Add it on the Vercel backend project: Settings → Environment Variables (Production), then redeploy.`,
    );
  }
  return value;
}

export function loadRuntimeEnv(): Record<string, string> {
  const env = process['env'];
  const out: Record<string, string> = {};
  for (const key of Object.keys(env)) {
    const value = env[key];
    if (typeof value === 'string') out[key] = value;
  }
  return out;
}
