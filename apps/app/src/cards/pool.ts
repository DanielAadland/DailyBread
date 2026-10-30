import type { CardBackground } from '@bible-app/core';

/**
 * The curated verse cards: a passage and a short reflection. Reflections are warm, practical and
 * theologically neutral (no doctrinal positions). The verse text comes from the reader's
 * translation at display time, so a card works in every translation.
 * Checked by src/cards/pool.test.ts (every passage exists and fits on a card).
 * Add a language by adding its key to `reflection`.
 */
export interface CuratedCard {
  id: string;
  passage: string;
  background: CardBackground;
  reflection: { en: string };
}

const CARDS: Array<[string, string]> = [
  ['PSA.46.10', 'Before the day gets loud, take one quiet minute. Stillness can be a way of trusting.'],
  ['LAM.3.22-LAM.3.23', 'Yesterday doesn’t get the last word. Today begins with mercy that is new this morning.'],
  ['ISA.41.10', 'Fear often feels like being alone with a problem. This verse says you are not.'],
  ['MAT.11.28', 'Tired is allowed. Bring whatever you are carrying and rest for a moment.'],
  ['JHN.14.27', 'This peace isn’t the absence of trouble. It is a gift that can sit right in the middle of it.'],
  ['PHP.4.6-PHP.4.7', 'Name one worry and turn it into a prayer. Then notice what changes, even a little.'],
  ['PSA.23.4', 'The valley is real, and so is the company. You don’t walk through it alone.'],
  ['PRO.3.5-PRO.3.6', 'You don’t need the whole map today. Trust for the next step is enough.'],
  ['2CO.12.9', 'Weakness isn’t the end of the story. It can be the place where grace shows up most.'],
  ['JOS.1.9', 'Courage isn’t feeling no fear. It is going forward knowing you are not going alone.'],
  ['PSA.118.24', 'Whatever today holds, it is a gift. Look for one thing to be glad about.'],
  ['MIC.6.8', 'Justice, mercy, humility: three words for a whole life. Which one fits your day?'],
  ['1CO.13.4-1CO.13.5', 'Read it again slowly. Where do these words already ring true for you, and where not yet?'],
  ['JHN.3.16', 'Perhaps the most quoted verse in the world. Read it as if for the first time.'],
  ['MAT.5.9', 'Is there one conversation today where you could bring peace instead of winning?'],
  ['MAT.6.34', 'Tomorrow will come with its own strength. Today only needs today’s.'],
  ['PSA.119.105', 'A lamp lights the next step, not the whole road. That is usually enough.'],
  ['ISA.40.31', 'When you feel empty, waiting isn’t wasted time. Strength can be renewed.'],
  ['ROM.12.12', 'Three small instructions for a long week: joy, patience, prayer.'],
  ['GAL.6.2', 'Who near you is carrying something heavy? A message, a meal or a prayer can lighten it.'],
  ['EPH.4.32', 'Kindness is often the bravest choice in the room.'],
  ['COL.3.23', 'Even ordinary tasks can be done with care and meaning.'],
  ['HEB.10.24', 'Think of one person to encourage today, and tell them.'],
  ['JAS.1.5', 'It’s okay not to know. Asking for wisdom is a good place to start.'],
  ['JAS.1.19', 'Listening first is harder than it sounds. Try it in your next conversation.'],
  ['1PE.5.7', 'You are allowed to put your worries down. They are cared about, and so are you.'],
  ['1JN.4.19', 'Love starts with being loved. Rest in that before you try to give it away.'],
  ['PSA.34.18', 'If today hurts, you are not far away. This verse says the opposite is true.'],
  ['PSA.139.14', 'You weren’t made by accident. Let that change how you speak to yourself today.'],
  ['ISA.43.2', 'The verse doesn’t promise there will be no rivers. It promises you won’t cross them alone.'],
  ['JER.29.11', 'First spoken to people far from home, waiting. Hope can be planted even in a long wait.'],
  ['ZEP.3.17', 'Imagine being sung over with joy. That is how this verse describes God’s care.'],
  ['NUM.6.24-NUM.6.26', 'An ancient blessing, spoken over people for thousands of years. Read it as if spoken to you.'],
  ['PSA.121.2', 'Where do you look first when you need help? This psalm lifts the eyes higher.'],
  ['PSA.90.12', 'Counting our days isn’t gloomy. It helps us spend them well.'],
  ['ECC.3.1', 'Not every season is for everything. What season are you in right now?'],
  ['MAT.5.14', 'A small light still lights a room. Where could yours shine today?'],
  ['MAT.7.7', 'Ask, seek, knock: three ways of not giving up.'],
  ['MRK.9.24', 'Belief and doubt can live in the same honest prayer.'],
  ['LUK.1.37', 'When something feels impossible, hold on to one promise for today.'],
  ['LUK.6.31', 'The simplest rule, and maybe the hardest. Try it once, on purpose, today.'],
  ['JHN.1.5', 'The darkness is real, but it doesn’t win. Look for one small light today.'],
  ['JHN.8.12', 'Following a light means you don’t have to see the end of the path.'],
  ['JHN.15.5', 'Growth comes from staying connected. What helps you stay close?'],
  ['JHN.16.33', 'Trouble isn’t a sign you’ve been forgotten. Courage is still possible.'],
  ['ROM.5.8', 'Love that doesn’t wait for us to be ready first.'],
  ['ROM.12.2', 'Renewal often starts with what we let fill our minds.'],
  ['ROM.15.13', 'A blessing of overflowing hope. Pray it today for someone you love.'],
  ['2CO.5.17', 'New beginnings are part of the story. What would you like to begin again?'],
  ['GAL.5.22-GAL.5.23', 'Nine kinds of fruit. Which one would you like to grow this week?'],
  ['EPH.2.10', 'You are a work in progress, with good work still ahead of you.'],
  ['PHP.4.13', 'Strength for what is in front of you, one thing at a time.'],
  ['PHP.4.8', 'What you dwell on grows. Pick one true and good thing to think about today.'],
  ['COL.3.15', 'Let peace settle the arguments in your heart today, and be thankful.'],
  ['1TH.5.16-1TH.5.18', 'Three short lines to carry with you through the day.'],
  ['2TI.1.7', 'Fear isn’t the spirit you were given. Power, love and a sound mind are.'],
  ['HEB.11.1', 'Faith looks forward. What are you hoping for today?'],
  ['HEB.13.5', 'Contentment comes more easily when you know you are not left alone.'],
  ['1JN.3.18', 'Love in action: one practical kindness today.'],
  ['REV.21.4', 'A promise of a day without tears. Hold on to it on the days with them.'],
  ['PSA.27.14', 'Waiting is not the same as giving up. Be strong, and give it time.'],
  ['PSA.55.22', 'Some burdens are too heavy to carry alone. You don’t have to.'],
  ['PSA.62.5', 'Rest is a place you can come back to again and again.'],
  ['PSA.103.2', 'Remember one good thing from this week, and say thank you for it.'],
  ['PSA.145.18', 'Near, not distant. You can speak today, in your own words.'],
  ['ISA.26.3', 'Where your mind rests shapes how your heart feels.'],
  ['ISA.12.2', 'Trust and fear can both show up today. This verse chooses trust.'],
  ['DEU.31.8', 'Someone has gone ahead of you into today. You don’t walk into it alone.'],
  ['PSA.16.11', 'Joy isn’t only found far away. Look for it close at hand today.'],
  ['PSA.4.8', 'If sleep is hard tonight, let this be the last thing you read.'],
];

const BACKGROUNDS: CardBackground[] = ['dawn', 'tide', 'olive', 'sand', 'dusk', 'night', 'meadow', 'rose', 'stone', 'sea', 'ember', 'mist'];

export const CURATED_CARDS: CuratedCard[] = CARDS.map(([passage, en], i) => ({
  id: `c${String(i + 1).padStart(3, '0')}`,
  passage,
  // Step by 5 (coprime with 12) so neighbouring cards look different.
  background: BACKGROUNDS[(i * 5) % BACKGROUNDS.length]!,
  reflection: { en },
}));
