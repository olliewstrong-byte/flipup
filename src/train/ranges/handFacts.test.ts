// Every claim the lessons and hints make about YOUR hand is checked against the real cards: the made hand
// (top pair, set, straight...), the draws (open-ended, gutshot, double gutshot, flush draw, nut flush draw,
// backdoor draws), overcards, and "gives you a straight" when you already had one. Named hands are checked
// too ("makes 7-6 a straight", "straights for A-5 and 6-5"). A sentence about their range isn't read.
import { describe, expect, it } from 'vitest';
import { rankOf, RANKS, suitOf, type Card } from '../../game/cards';
import { describeHand } from '../../game/evaluate';
import { combosOf } from './model';
import { SCENARIOS } from './scenarios';

type Street = 'preflop' | 'flop' | 'turn' | 'river';
const BOARD_LEN: Record<Street, number> = { preflop: 0, flop: 3, turn: 4, river: 5 };
const PREV: Record<Street, Street | null> = { preflop: null, flop: null, turn: 'flop', river: 'turn' };

/** The scenarios write cards as "As"; lesson text writes them "A♠". */
const SYMBOL: Record<string, string> = { s: '♠', h: '♥', d: '♦', c: '♣' };

function withLowAce(ranks: number[]): Set<number> {
  const s = new Set(ranks);
  if (s.has(14)) s.add(1);
  return s;
}

/** Highest straight in a set of ranks, or 0. */
function straightHigh(ranks: Set<number>): number {
  for (let h = 14; h >= 5; h--) {
    let ok = true;
    for (let r = h; r > h - 5; r--) if (!ranks.has(r)) ok = false;
    if (ok) return h;
  }
  return 0;
}

/** Ranks that would give you a straight the board alone doesn't have. */
function straightOuts(hole: number[], board: number[]): number[] {
  const outs: number[] = [];
  for (let r = 2; r <= 14; r++) {
    const mine = straightHigh(withLowAce([...hole, ...board, r]));
    if (mine && mine !== straightHigh(withLowAce([...board, r]))) outs.push(r);
  }
  return outs;
}

/** Four in a row with a hole card in it, open at both ends: an open-ended straight draw. */
function openEnded(hole: number[], board: number[]): boolean {
  const s = withLowAce([...hole, ...board]);
  const holeLow = withLowAce(hole);
  for (let lo = 2; lo <= 10; lo++) {
    const run = [lo, lo + 1, lo + 2, lo + 3];
    if (run.every((r) => s.has(r)) && run.some((r) => holeLow.has(r))) return true;
  }
  return false;
}

interface Facts {
  category: number;
  topPair: boolean;
  secondPair: boolean;
  bottomPair: boolean;
  overpair: boolean;
  set: boolean;
  trips: boolean;
  straight: boolean;
  flush: boolean;
  outs: number[];
  oesd: boolean;
  wheelGutshot: boolean;
  flushDraw: boolean;
  nutFlushDraw: boolean;
  backdoorFlush: boolean;
  backdoorStraight: boolean;
  backdoorWheel: boolean;
  overcards: number;
}

function factsAt(hero: Card[], fullBoard: Card[], street: Street): Facts {
  const board = fullBoard.slice(0, BOARD_LEN[street]);
  const hole = hero.map(rankOf);
  const br = board.map(rankOf);
  const distinct = [...new Set(br)].sort((a, b) => b - a);
  const v = describeHand([...hero, ...board]);
  const pocket = hole[0] === hole[1];
  const count = (r: number) => br.filter((x) => x === r).length;
  const madeStraight = straightHigh(withLowAce([...hole, ...br])) !== 0 && straightHigh(withLowAce([...hole, ...br])) !== straightHigh(withLowAce(br));
  const flushSuit = 'shdc'.split('').find((s) => [...hero, ...board].filter((c) => suitOf(c) === s).length >= 5);
  const mineInFlush = !!flushSuit && hero.some((c) => suitOf(c) === flushSuit);
  const drawing = board.length >= 3 && board.length < 5;
  const outs = drawing && !madeStraight ? straightOuts(hole, br) : [];
  const oesd = outs.length >= 2 && openEnded(hole, br);

  let flushDraw = false;
  let nutFlushDraw = false;
  let backdoorFlush = false;
  if (drawing && !mineInFlush) {
    for (const s of 'shdc') {
      const mine = hero.filter((c) => suitOf(c) === s);
      if (!mine.length) continue;
      const n = [...hero, ...board].filter((c) => suitOf(c) === s).length;
      if (n === 4) {
        flushDraw = true;
        // The nut flush draw: you hold the highest card of the suit not on the board.
        const top = [...RANKS].reverse().find((r) => !board.includes(`${r}${s}`));
        if (mine.some((c) => c[0] === top)) nutFlushDraw = true;
      }
      if (board.length === 3 && n === 3) backdoorFlush = true;
    }
  }

  // Backdoor straight draw: two more cards (turn and river) would make a straight with your cards.
  let backdoorStraight = false;
  let backdoorWheel = false;
  if (board.length === 3 && !madeStraight && !outs.length) {
    for (let a = 2; a <= 14; a++)
      for (let b = a; b <= 14; b++) {
        const high = straightHigh(withLowAce([...hole, ...br, a, b]));
        if (high && high !== straightHigh(withLowAce([...br, a, b]))) {
          backdoorStraight = true;
          if (high === 5) backdoorWheel = true;
        }
      }
  }

  const matched = hole.filter((r) => br.includes(r));
  return {
    category: v.category,
    topPair: matched.includes(distinct[0]),
    secondPair: matched.includes(distinct[1]) || (pocket && !br.includes(hole[0]) && hole[0] < distinct[0] && hole[0] > (distinct[1] ?? 0)),
    bottomPair: distinct.length > 1 && matched.includes(distinct[distinct.length - 1]),
    overpair: pocket && hole[0] > distinct[0],
    set: pocket && count(hole[0]) >= 1,
    trips: !pocket && matched.some((r) => count(r) >= 2),
    straight: madeStraight,
    flush: mineInFlush,
    outs,
    oesd,
    wheelGutshot: outs.length >= 1 && outs.some((r) => straightHigh(withLowAce([...hole, ...br, r])) === 5),
    flushDraw,
    nutFlushDraw,
    backdoorFlush,
    backdoorStraight,
    backdoorWheel,
    overcards: hole.filter((r) => r > distinct[0]).length,
  };
}

/** A claim about your hand: the words, and what has to be true for them. */
interface Claim {
  name: string;
  words: RegExp;
  holds: (f: Facts) => boolean;
  /** A made hand: "gives you a straight" must be new on this street. */
  made?: boolean;
}

const CLAIMS: Claim[] = [
  { name: 'open-ended straight draw', words: /\bopen-end(?:ed|er)\b/, holds: (f) => f.oesd },
  { name: 'double gutshot', words: /\bdouble gutshot\b/, holds: (f) => f.outs.length >= 2 && !f.oesd },
  { name: 'wheel gutshot', words: /\bwheel gutshot\b/, holds: (f) => f.wheelGutshot && !f.oesd },
  { name: 'gutshot', words: /(?<!double |wheel )\bgutshot\b/, holds: (f) => f.outs.length === 1 },
  { name: 'backdoor wheel draw', words: /\bbackdoor wheel draw\b/, holds: (f) => f.backdoorWheel },
  { name: 'backdoor straight draw', words: /\bbackdoor straight draws?\b/, holds: (f) => f.backdoorStraight },
  { name: 'backdoor flush draw', words: /\bbackdoor (?:flush|spade|heart|diamond|club) draws?\b/, holds: (f) => f.backdoorFlush },
  { name: 'backdoor draws', words: /\bbackdoor draws?\b(?! like)/, holds: (f) => f.backdoorFlush || f.backdoorStraight },
  { name: 'nut flush draw', words: /\bnut flush draw\b/, holds: (f) => f.nutFlushDraw },
  { name: 'flush draw', words: /(?<!backdoor |nut |straight-)\bflush draw\b/, holds: (f) => f.flushDraw },
  { name: 'straight draw', words: /(?<!backdoor |open-ended |straight-flush )\bstraight draw\b/, holds: (f) => f.outs.length >= 1 },
  { name: 'two overcards', words: /\btwo overcards\b/, holds: (f) => f.overcards === 2 },
  { name: 'overcards', words: /(?<!two )\bovercards\b/, holds: (f) => f.overcards === 2 },
  { name: 'an overcard', words: /\ban overcard\b/, holds: (f) => f.overcards === 1 },
  { name: 'top pair', words: /\btop pair\b/, holds: (f) => f.topPair && f.category <= 2, made: true },
  { name: 'second pair', words: /\b(?:second|middle) pair\b/, holds: (f) => f.secondPair && f.category <= 2, made: true },
  { name: 'bottom pair', words: /\bbottom pair\b/, holds: (f) => f.bottomPair && f.category <= 2, made: true },
  { name: 'overpair', words: /\boverpair\b/, holds: (f) => f.overpair && f.category <= 2, made: true },
  { name: 'set', words: /\b(?:a|the|top|middle|bottom) set\b/, holds: (f) => f.set, made: true },
  { name: 'trips', words: /\btrips\b|\btrip (?:twos|threes|fours|fives|sixes|sevens|eights|nines|tens|jacks|queens|kings|aces)\b/, holds: (f) => f.trips, made: true },
  { name: 'two pair', words: /\b(?:top )?two pair\b/, holds: (f) => f.category === 2, made: true },
  { name: 'straight', words: /\bstraight\b(?! draw| flush|-flush)/, holds: (f) => f.straight, made: true },
  { name: 'flush', words: /(?<!backdoor |straight )\bflush\b(?! draw| line| board| card)/, holds: (f) => f.flush, made: true },
  { name: 'full house', words: /\bfull house\b|\b(?:twos|threes|fours|fives|sixes|sevens|eights|nines|tens|jacks|queens|kings|aces) full\b/, holds: (f) => f.category === 6, made: true },
  { name: 'quads', words: /\bquads\b/, holds: (f) => f.category === 7, made: true },
];

/** Words that say the hand is yours, and what may come between them and the claim. */
const OWNER =
  /(?:\byour\b|\byou (?:have|hold|flop|turn|river|pick up|make|keep|still have|are left with|’re left with)\b|\bgives you\b|\bleaves you\b|\bmakes your\b|\bcompletes your\b|\bpairs your\b|\byou (?:\S+ ){0,5}with\b|\band (?:have|hold)\b)/g;
/** Once these come between, the claim is about someone else's hand ("you're ahead of flush draws"). */
const NOT_YOURS =
  /\b(?:they|their|them|theirs|ahead of|behind|beats?|loses? to|against|like|such as|than|fold|folds|calls? with|bets? with|raises? with|for|only|except|unless|if|any|every|where|completes|plus|range)\b|\b[akqjt2-9]-[akqjt2-9]\b|[♠♥♦♣]/;

/** The claims in a sentence that are about your hand. */
function claimsAboutYou(sentence: string): Claim[] {
  const low = sentence.toLowerCase();
  const found: Claim[] = [];
  for (const claim of CLAIMS) {
    const m = claim.words.exec(low);
    if (!m) continue;
    const before = low.slice(0, m.index);
    // The last owner word before the claim, and nothing in between that hands it to someone else.
    let last = -1;
    let lastEnd = -1;
    for (const o of before.matchAll(OWNER)) {
      if (/\b(?:they|them|their|and \w+ (?:calls?|bets?|raises?))\b|[,;]/.test(o[0])) continue;
      last = o.index!;
      lastEnd = o.index! + o[0].length;
    }
    if (last < 0) continue;
    const between = low.slice(lastEnd, m.index);
    if (NOT_YOURS.test(between) || /[;:]/.test(between) || between.length > 70) continue;
    // "Trips in your range" is about the range; "a nine or a king makes your straight" is what's to come.
    if (/^\S* in your range/.test(low.slice(m.index + m[0].length - 1))) continue;
    if (/\b(?:a|an) [a-z]+(?: or (?:a|an) [a-z]+)? (?:makes|gives you|would)\b[^.]*$/.test(low.slice(0, lastEnd))) continue;
    found.push(claim);
  }
  // "Straight flush" isn't a straight or a flush claim; "nut flush draw" isn't a flush draw claim.
  return found;
}

/** What a two-rank hand makes on the board, by ranks alone. */
function makesWithRanks(a: string, b: string, board: Card[]): { straight: boolean; full: boolean; set: boolean; twoPair: boolean } {
  const ra = RANKS.indexOf(a) + 2;
  const rb = RANKS.indexOf(b) + 2;
  const br = board.map(rankOf);
  const all = [ra, rb, ...br];
  const high = straightHigh(withLowAce(all));
  const counts = new Map<number, number>();
  for (const r of all) counts.set(r, (counts.get(r) ?? 0) + 1);
  const trips = [...counts.values()].filter((n) => n >= 3).length;
  const pairs = [...counts.values()].filter((n) => n === 2).length;
  return {
    straight: high !== 0 && high !== straightHigh(withLowAce(br)),
    full: trips >= 1 && (pairs >= 1 || trips >= 2),
    set: ra === rb && br.includes(ra),
    twoPair: pairs >= 2 && (br.includes(ra) || br.includes(rb)),
  };
}

const sentences = (text: string) => text.split(/(?<=[.!?])\s+(?=[A-Z0-9])/);

interface Piece {
  where: string;
  street: Street;
  text: string;
}

function piecesOf(s: (typeof SCENARIOS)[number]): Piece[] {
  const decision = (['flop', 'turn', 'river'] as const)[s.board.length - 3];
  return [
    ...s.clues.map((c) => ({ where: 'hint', street: c.street as Street, text: c.text })),
    ...s.streets.map((r) => ({ where: 'story', street: r.street as Street, text: r.text })),
    { where: 'why', street: decision, text: s.why },
  ];
}

const pretty = (cards: Card[]) => cards.map((c) => c[0].replace('T', '10') + SYMBOL[c[1]]).join(' ');

describe('what the lessons say about your hand', () => {
  it('matches your real cards on every street', () => {
    const wrong: string[] = [];
    for (const s of SCENARIOS) {
      for (const p of piecesOf(s)) {
        if (p.street === 'preflop') continue;
        const now = factsAt(s.hero.cards, s.board, p.street);
        const prevStreet = PREV[p.street];
        const prev = prevStreet ? factsAt(s.hero.cards, s.board, prevStreet) : null;
        for (const sentence of sentences(p.text)) {
          const missed = /\bmiss(?:es|ed)?\b/.test(sentence.toLowerCase());
          for (const claim of claimsAboutYou(sentence)) {
            // "The 2♣ misses your flush draw" is about the street before.
            const ok = claim.holds(now) || (missed && !!prev && claim.holds(prev));
            if (!ok) wrong.push(`${s.id} [${p.where} ${p.street}] says ${claim.name}: “${sentence}” (you: ${pretty(s.hero.cards)}, board ${pretty(s.board.slice(0, BOARD_LEN[p.street]))})`);
            else if (claim.made && prev && claim.holds(prev) && /\b(?:gives you|makes your|completes your)\b/i.test(sentence) && !missed)
              wrong.push(`${s.id} [${p.where} ${p.street}] says the card gives you ${claim.name}, but you had it already: “${sentence}”`);
          }
        }
      }
    }
    if (wrong.length) throw new Error(`${wrong.length} wrong:\n${wrong.join('\n')}`);
  });

  it('names what other hands make correctly', () => {
    const wrong: string[] = [];
    const HAND = '([AKQJT2-9])-([AKQJT2-9])';
    for (const s of SCENARIOS) {
      for (const p of piecesOf(s)) {
        if (p.street === 'preflop') continue;
        const board = s.board.slice(0, BOARD_LEN[p.street]);
        const check = (a: string, b: string, what: string, sentence: string) => {
          const m = makesWithRanks(a, b, board);
          const ok = /straight|wheel/.test(what) ? m.straight : /full/.test(what) ? m.full : /set/.test(what) ? m.set : m.twoPair;
          if (!ok) wrong.push(`${s.id} [${p.where} ${p.street}] says ${a}-${b} makes ${what} on ${pretty(board)}: “${sentence}”`);
        };
        for (const sentence of sentences(p.text)) {
          // "makes 7-6 a straight", "gives J-T a straight"
          for (const m of sentence.matchAll(new RegExp(`\\b(?:makes|gives) ${HAND} (?:a |the )?(straight|wheel|full house|set|two pair)`, 'g'))) check(m[1], m[2], m[3], sentence);
          // "A-3’s wheel"
          for (const m of sentence.matchAll(new RegExp(`\\b${HAND}’s (straight|wheel|full house|set)\\b`, 'g'))) check(m[1], m[2], m[3], sentence);
          // "straights for A-5 and 6-5"
          for (const m of sentence.matchAll(new RegExp(`\\bstraights? for (${HAND}(?:(?:, | and | or )${HAND})*)`, 'g')))
            for (const h of m[1].split(/, | and | or /)) check(h[0], h[2], 'straight', sentence);
        }
      }
    }
    if (wrong.length) throw new Error(`${wrong.length} wrong:\n${wrong.join('\n')}`);
  });

  it('names their hand groups by what the hands make on the final board', () => {
    // "Overpairs: J-J, K-K, A-A" on a board with a queen, or "Full houses: K-K" on A-A-3-3: a group's name must be
    // true of every hand in it. Names that aren't made hands ("Missed draws", "Kings", "Big pairs") aren't read.
    const KINDS: [RegExp, (h: { cat: number; pocket: boolean; hits: number; over: boolean; top: boolean; straight: boolean; flush: boolean }) => boolean][] = [
      [/^(?:smaller |bigger |top |middle |bottom |a )?sets?$/, (h) => h.pocket && h.hits >= 1],
      [/^trips$/, (h) => !h.pocket && h.cat >= 3],
      [/^(?:the same |nut |smaller |lower |higher |bigger |a )?straights?(?: with an? \w+)?$|^broadway$|^(?:the |a )?wheel$/, (h) => h.straight],
      [/^(?:nut |smaller |lower |big |small )?flush(?:es)?$/, (h) => h.flush],
      [/^full houses?$/, (h) => h.cat >= 6],
      [/^(?:top )?two pairs?$/, (h) => h.cat >= 2 && !(h.pocket && h.hits >= 1)],
      [/^quads$/, (h) => h.cat === 7],
      [/^overpairs?$/, (h) => h.over],
      [/^top pair$/, (h) => h.top],
    ];
    const wrong: string[] = [];
    for (const s of SCENARIOS) {
      const br = s.board.map(rankOf);
      const top = Math.max(...br);
      for (const o of s.opponents)
        for (const g of o.range) {
          const name = g.label.toLowerCase().split(/[:(]/)[0].trim();
          if (/draw/.test(name)) continue;
          const kinds = name.split(/, | and | or /).map((p) => KINDS.find(([re]) => re.test(p.trim()))?.[1]);
          if (!kinds.length || kinds.some((k) => !k)) continue;
          for (const cards of combosOf(g, [...s.hero.cards, ...s.board])) {
            const r = cards.map(rankOf);
            const high = straightHigh(withLowAce([...r, ...br]));
            const flushSuit = 'shdc'.split('').find((x) => [...cards, ...s.board].filter((c) => suitOf(c) === x).length >= 5);
            const h = {
              cat: describeHand([...cards, ...s.board]).category,
              pocket: r[0] === r[1],
              hits: r.filter((x) => br.includes(x)).length,
              over: r[0] === r[1] && r[0] > top,
              top: r.includes(top),
              straight: high !== 0 && high !== straightHigh(withLowAce(br)),
              flush: !!flushSuit && cards.some((c) => suitOf(c) === flushSuit),
            };
            if (!kinds.some((k) => k!(h))) {
              wrong.push(`${s.id} [${o.pos}] “${g.label}” holds ${pretty(cards)}, which isn’t that on ${pretty(s.board)}`);
              break;
            }
          }
        }
    }
    if (wrong.length) throw new Error(`${wrong.length} wrong:\n${wrong.join('\n')}`);
  });

  it('reads the cards the way a player would', () => {
    // A few known hands, so the checker itself stays honest.
    const f = (hero: string[], board: string[], st: Street) => factsAt(hero, board, st);
    expect(f(['Kd', 'Td'], ['Qc', 'Jd', '9d'], 'flop').straight).toBe(true);
    expect(f(['Kd', 'Td'], ['Qc', 'Jd', '9d'], 'flop').oesd).toBe(false);
    expect(f(['Kd', 'Td'], ['Qc', 'Jd', '9d'], 'flop').flushDraw).toBe(true);
    expect(f(['As', '3s'], ['5c', '4c', '4h'], 'flop').wheelGutshot).toBe(true);
    expect(f(['Ad', 'Qc'], ['Jd', '3s', '2h'], 'flop').outs).toEqual([]);
    expect(f(['Ad', 'Qc'], ['Jd', '3s', '2h'], 'flop').backdoorWheel).toBe(true);
    expect(f(['Ts', '9s'], ['8c', '7d', '2c'], 'flop').oesd).toBe(true);
    expect(f(['Ad', 'Qs'], ['Jh', 'Tc', '8c'], 'flop').outs).toEqual([9, 13]);
    expect(f(['Ad', 'Qs'], ['Jh', 'Tc', '8c'], 'flop').oesd).toBe(false);
    expect(f(['Ac', '5c'], ['6c', '3c', '2s'], 'flop').nutFlushDraw).toBe(true);
    expect(f(['Ad', 'Ah'], ['Qs', '8s', '4h', '4d'], 'turn').category).toBe(2);
    expect(claimsAboutYou('You’re ahead of draws like A-9 and flush draws.')).toEqual([]);
    expect(claimsAboutYou('You call with a gutshot and an overcard.').map((c) => c.name)).toEqual(['gutshot', 'an overcard']);
  });
});
