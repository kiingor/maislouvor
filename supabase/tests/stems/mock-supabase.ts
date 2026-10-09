export const createClient = (...args: unknown[]) => (globalThis as any).mockCreateClient(...args);
