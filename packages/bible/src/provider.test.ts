import { describe, expect, it, vi } from 'vitest';
import { BibleTextError, StaticBibleProvider } from './provider';
import { parseReference } from './reference';

function fakeFetch(chapters: Record<string, Array<[number, string]>>) {
  return vi.fn(async (url: string) => {
    const m = /\/(\w+)\/(\w+)\/(\d+)\.json$/.exec(url);
    const key = m ? `${m[2]}.${m[3]}` : '';
    const data = chapters[key];
    if (!data) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => ({ verses: data.map(([verse, text]) => ({ verse, text })) }) };
  });
}

const data = {
  'ROM.8': [[27, 'a'], [28, 'b'], [29, 'c']] as Array<[number, string]>,
  'ROM.9': [[1, 'd'], [2, 'e'], [3, 'f']] as Array<[number, string]>,
};

describe('StaticBibleProvider', () => {
  it('builds the chapter URL and caches results', async () => {
    const fetch = fakeFetch(data);
    const p = new StaticBibleProvider('bsb', 'https://cdn.example/bible/', fetch);
    const ch = await p.getChapter('ROM', 8);
    await p.getChapter('ROM', 8);
    expect(ch.verses).toHaveLength(3);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith('https://cdn.example/bible/bsb/ROM/8.json');
  });

  it('cuts passages across chapters', async () => {
    const p = new StaticBibleProvider('bsb', '/bible', fakeFetch(data));
    const verses = await p.getPassage(parseReference('Rom 8:28-9:2')!);
    expect(verses.map((v) => `${v.chapter}:${v.verse}`)).toEqual(['8:28', '8:29', '9:1', '9:2']);
  });

  it('reports missing chapters and retries after a failure', async () => {
    const fetch = fakeFetch(data);
    const p = new StaticBibleProvider('bsb', '/bible', fetch);
    await expect(p.getChapter('GEN', 1)).rejects.toMatchObject({ code: 'not_found' });
    await expect(p.getChapter('GEN', 1)).rejects.toBeInstanceOf(BibleTextError);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('evicts the least recently used chapter', async () => {
    const fetch = fakeFetch(data);
    const p = new StaticBibleProvider('bsb', '/bible', fetch, undefined, 1);
    await p.getChapter('ROM', 8);
    await p.getChapter('ROM', 9);
    await p.getChapter('ROM', 8);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('needs a search function for search', async () => {
    const p = new StaticBibleProvider('bsb', '/bible', fakeFetch(data));
    await expect(p.search('love')).rejects.toMatchObject({ code: 'unsupported' });
  });
});
