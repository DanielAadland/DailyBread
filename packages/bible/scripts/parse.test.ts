import { describe, expect, it } from 'vitest';
import { cleanText, parseUsfx } from './parse';

describe('parseUsfx', () => {
  const xml = `<usfx><book id="FRT"><p>Preface</p></book><book id="JHN"><h>John</h><c id="3"/>
<p><v id="3"/>Jesus answered him,
<wj>“Most certainly, I tell you, unless one is born anew,
</wj><f caller="+">The word <ref tgt="JHN.3.7">John 3:7</ref> also means “again”.</f>
<wj>he can’t see God’s Kingdom.”</wj>
<ve/></p><p><v id="4"/>Nicodemus said &amp; asked.<x caller="-">Ref</x><ve/></p></book>
<book id="PSA"><c id="3"/><d>A Psalm by David.</d><q><v id="1"/>Yahweh, how my adversaries have increased!<ve/></q></book></usfx>`;

  it('keeps verse text and drops footnotes, cross-references, titles and non-canonical books', () => {
    const text = parseUsfx(xml);
    expect([...text.keys()]).toEqual(['JHN', 'PSA']);
    expect(text.get('JHN')!.get(3)).toEqual([
      { verse: 3, text: 'Jesus answered him, “Most certainly, I tell you, unless one is born anew, he can’t see God’s Kingdom.”' },
      { verse: 4, text: 'Nicodemus said & asked.' },
    ]);
    expect(text.get('PSA')!.get(3)).toEqual([{ verse: 1, text: 'Yahweh, how my adversaries have increased!' }]);
  });
});

describe('cleanText', () => {
  it('collapses whitespace and fixes spaces before punctuation', () => {
    expect(cleanText('  Hello ,\n world  . ')).toBe('Hello, world.');
    expect(cleanText('“ Quote ”')).toBe('“Quote”');
  });
});
