import { en } from './en';

type Dict = Record<string, unknown>;

/**
 * Tiny i18n helper. English-only for now; add hi.ts with the same keys and switch `active`.
 * Usage: t('login.title') or t('otp.subtitle', { email }).
 */
const active: Dict = en;

export function t(path: string, vars?: Record<string, string | number>): string {
  const value = path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object') return (acc as Dict)[key];
    return undefined;
  }, active);

  let str = typeof value === 'string' ? value : path;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return str;
}

export { en };
