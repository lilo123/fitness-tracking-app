import { describe, it, expect, vi, afterEach } from 'vitest';

describe('supabase client environment configuration', () => {
  const originalEnv = { ...import.meta.env };

  afterEach(() => {
    (import.meta.env as any).PROD = originalEnv.PROD;
    (import.meta.env as any).VITE_SUPABASE_URL = originalEnv.VITE_SUPABASE_URL;
    vi.resetModules();
  });

  it('exports a supabase client when in development', async () => {
    (import.meta.env as any).PROD = false;
    (import.meta.env as any).VITE_SUPABASE_URL = '';
    const { supabase } = await import('./supabase');
    expect(supabase).toBeDefined();
    expect(supabase.auth).toBeDefined();
  });

  it('fails fast with a descriptive error in production if VITE_SUPABASE_URL is missing', async () => {
    vi.resetModules();
    (import.meta.env as any).PROD = true;
    delete (import.meta.env as any).VITE_SUPABASE_URL;

    await expect(async () => {
      await import('./supabase');
    }).rejects.toThrow('VITE_SUPABASE_URL is required in production environment');
  });

  it('succeeds in production when VITE_SUPABASE_URL is provided', async () => {
    vi.resetModules();
    (import.meta.env as any).PROD = true;
    (import.meta.env as any).VITE_SUPABASE_URL = 'https://my-prod-project.supabase.co';

    const { supabase } = await import('./supabase');
    expect(supabase).toBeDefined();
    expect((supabase as any).supabaseUrl).toBe('https://my-prod-project.supabase.co');
  });
});
