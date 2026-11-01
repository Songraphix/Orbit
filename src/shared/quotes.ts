/** Quotes for the new tab page: one a day, the same all day. */
export const QUOTES: readonly { text: string; by: string }[] = [
  { text: 'A consistent creative builds a powerful future.', by: '' },
  { text: 'Simplicity is the ultimate sophistication.', by: 'Leonardo da Vinci' },
  { text: 'The secret of getting ahead is getting started.', by: 'Mark Twain' },
  { text: 'Make it work, make it right, make it fast.', by: 'Kent Beck' },
  { text: 'Done is better than perfect.', by: '' },
  { text: 'Small steps every day.', by: '' },
  { text: 'Creativity is intelligence having fun.', by: '' },
  { text: 'Well begun is half done.', by: 'Aristotle' },
  { text: 'You can’t use up creativity. The more you use, the more you have.', by: 'Maya Angelou' },
  { text: 'What we fear doing most is usually what we most need to do.', by: 'Tim Ferriss' },
  { text: 'Quality is not an act, it is a habit.', by: 'Will Durant' },
  { text: 'Focus on being productive instead of busy.', by: 'Tim Ferriss' },
  { text: 'Design is how it works.', by: 'Steve Jobs' },
  { text: 'It always seems impossible until it’s done.', by: 'Nelson Mandela' },
  { text: 'Inspiration exists, but it has to find you working.', by: 'Pablo Picasso' },
  { text: 'The best way out is always through.', by: 'Robert Frost' },
  { text: 'Less, but better.', by: 'Dieter Rams' },
  { text: 'Start where you are. Use what you have. Do what you can.', by: 'Arthur Ashe' },
  { text: 'Action is the foundational key to all success.', by: 'Pablo Picasso' },
  {
    text: 'Great things are done by a series of small things brought together.',
    by: 'Vincent van Gogh',
  },
];

/** Today's quote (by local date), or `offset` quotes on from it. Pure. */
export function quoteFor(date: Date, offset = 0): { text: string; by: string } {
  const day = Math.floor(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000,
  );
  const n = QUOTES.length;
  return QUOTES[(((day + offset) % n) + n) % n]!;
}
