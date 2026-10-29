import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BADGE_CODES } from '../../core/src/badges';
import { BOOK_IDS } from '../../bible/src/books';
import en from './en.json';

const appSrc = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'apps', 'app', 'src');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.tsx?$/.test(name) ? [path] : [];
  });
}

function has(key: string): boolean {
  const lookup = (k: string) => k.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], en);
  return lookup(key) !== undefined || lookup(`${key}_other`) !== undefined;
}

describe('translation keys', () => {
  it('every literal key used in the app exists in en.json', () => {
    const missing = new Set<string>();
    for (const file of files(appSrc)) {
      const source = readFileSync(file, 'utf8');
      // t('a.b'), label: 'a.b', and keys listed in arrays like ['reading.spacingCompact', …]
      for (const m of source.matchAll(/\bt\(\s*'([a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)+)'/g)) if (!has(m[1]!)) missing.add(m[1]!);
      for (const m of source.matchAll(/label: '([a-z]+\.[a-zA-Z0-9_.]+)'/g)) if (!has(m[1]!)) missing.add(m[1]!);
      for (const m of source.matchAll(/'((?:reading|today|plans)\.[a-zA-Z0-9_]+)'/g)) if (!has(m[1]!)) missing.add(m[1]!);
    }
    expect([...missing]).toEqual([]);
  });

  it('has a name for every book and badge', () => {
    expect(BOOK_IDS.filter((id) => !has(`books.${id}`))).toEqual([]);
    expect(BADGE_CODES.filter((c) => !has(`badges.${c}.name`) || !has(`badges.${c}.description`))).toEqual([]);
  });

  it('has the keys built at runtime', () => {
    const dynamic = [
      ...['Morning', 'Afternoon', 'Evening'].flatMap((p) => [`today.greeting${p}`, `today.greeting${p}Name`]),
      ...['public', 'friends', 'private'].flatMap((v) => [`profile.visibility.${v}`, `settings.visibilityHelp.${v}`]),
      ...['yellow', 'green', 'blue', 'pink', 'purple'].map((c) => `reader.colors.${c}`),
      ...['supported', 'unsupported', 'not_configured', 'denied', 'demo'].filter((s) => s !== 'supported').map((s) => `reminders.push_${s}`),
      'legal.privacySections',
      'legal.termsSections',
    ];
    expect(dynamic.filter((k) => !has(k))).toEqual([]);
  });

  it('has a message for every error code the backends raise', () => {
    const codes = new Set<string>();
    for (const file of files(join(appSrc, 'api'))) {
      const source = readFileSync(file, 'utf8');
      for (const m of source.matchAll(/new AppError\('([a-z_]+)'/g)) codes.add(m[1]!);
      const known = /KNOWN_ERRORS = \[([\s\S]*?)\]/.exec(source);
      if (known) for (const m of known[1]!.matchAll(/'([a-z_]+)'/g)) codes.add(m[1]!);
    }
    expect([...codes].filter((c) => !has(`errors.${c}`))).toEqual([]);
  });
});
