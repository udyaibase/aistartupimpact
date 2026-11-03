import { describe, it, expect, vi, beforeEach } from 'vitest';

const s = vi.hoisted(() => ({ session: null as null | { id: string } }));
const redirect = vi.hoisted(() => vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`); }));
vi.mock('next/navigation', () => ({ redirect }));
vi.mock('@/lib/employer-auth', () => ({ getEmployerSession: async () => s.session }));

const pages = {
  login: () => import('@/app/employer/(auth)/login/layout'),
  signup: () => import('@/app/employer/(auth)/signup/layout'),
  'forgot-password': () => import('@/app/employer/(auth)/forgot-password/layout'),
};

describe('employer sign-in, signup and password pages', () => {
  beforeEach(() => { redirect.mockClear(); s.session = null; });

  for (const [name, load] of Object.entries(pages)) {
    it(`${name}: signed out → the page itself; signed in → the portal (never the form inside the dashboard)`, async () => {
      const Layout = (await load()).default;
      const child = 'FORM';
      expect(await Layout({ children: child as never })).toBeTruthy();
      expect(redirect).not.toHaveBeenCalled();
      s.session = { id: 'e1' };
      await expect(Layout({ children: child as never })).rejects.toThrow('REDIRECT:/employer');
    });
  }
});
