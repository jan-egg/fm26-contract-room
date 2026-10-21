const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../engine.js');

const fmt = { money: v => String(Math.round(v)), wage: v => String(Math.round(v)), per: '/wk' };
const demand = over => Object.assign(Object.fromEntries(E.KEYS.map(k => [k, 0])), over);
const inputs = over => Object.assign({
  ctx: 'transfer', years: 4, period: 52, stall: 2, walkaway: 0,
  fixtures: 46, role: 'rotation', pos: 'mid',
  demand: demand({ wage: 10000 }), locks: {}
}, over);

test('opening offer strips unlocked bonuses and opens at the community factor', () => {
  const inp = inputs({ demand: demand({ wage: 10000, appfee: 800, goal: 1200, sub: 300 }) });
  const r = E.recommend(inp, E.fresh(), [], fmt);
  assert.equal(r.phase, 'open');
  assert.equal(r.offer.wage, 8000);
  assert.equal(r.offer.appfee, 0);
  assert.equal(r.offer.goal, 0);
  assert.equal(r.offer.sub, 0);
});

test('locked bonuses stay in the offer, cut with the wage', () => {
  const inp = inputs({ demand: demand({ wage: 10000, goal: 1200 }), locks: { goal: true } });
  assert.equal(E.recommend(inp, E.fresh(), [], fmt).offer.goal, 960);
});

test('locked concessions are kept, not zeroed, and are never offered as a pivot', () => {
  const inp = inputs({ demand: demand({ wage: 10000, agent: 50000, signon: 20000 }), locks: { agent: true } });
  const open = E.recommend(inp, E.fresh(), [], fmt);
  assert.equal(open.offer.agent, 50000);
  assert.equal(open.offer.signon, 0);
  const pivot = E.recommend(inp, Object.assign(E.fresh(), { round: 3, phase: 'pivot', lastOffer: 9000 }), [], fmt);
  assert.equal(pivot.concession, 'signon');
});

test('fallback lump sum is measured in weeks of wage whatever the display period', () => {
  const S = Object.assign(E.fresh(), { round: 3, phase: 'pivot', lastOffer: 9000 });
  const weekly = E.recommend(inputs({ demand: demand({ wage: 10000 }) }), S, [], fmt);
  const yearly = E.recommend(inputs({ period: 1, demand: demand({ wage: 520000 }) }),
    Object.assign({}, S, { lastOffer: 468000 }), [], fmt);
  assert.equal(weekly.offer.agent, 80000);
  assert.equal(yearly.offer.agent, 80000);
});

test('pivot with no concessions left becomes walk away without mutating state', () => {
  const S = Object.assign(E.fresh(), { round: 5, phase: 'pivot', lastOffer: 9000, given: ['agent', 'signon', 'loyalty'] });
  const r = E.recommend(inputs(), S, [], fmt);
  assert.equal(r.phase, 'walk');
  assert.equal(S.phase, 'pivot');
  assert.equal(r.offer.wage, 9000);
});

test('walk-away ceiling caps the wage', () => {
  const r = E.recommend(inputs({ walkaway: 7000 }), E.fresh(), [], fmt);
  assert.equal(r.offer.wage, 7000);
  assert.ok(r.capped);
});

test('ladder splits the difference and never offers above his demand', () => {
  const S = Object.assign(E.fresh(), { round: 2, phase: 'ladder', lastOffer: 8000 });
  assert.equal(E.recommend(inputs({ demand: demand({ wage: 9000 }) }), S, [], fmt).offer.wage, 8500);
  const lower = E.recommend(inputs({ demand: demand({ wage: 7500 }) }), S, [], fmt);
  assert.equal(lower.offer.wage, 7500);
  assert.ok(lower.warns.some(w => w.includes('Accept his terms')));
});

test('advance walks the phases: moved, stalled into pivot, then concessions', () => {
  const inp = inputs({ stall: 2 });
  let S = E.fresh();
  let r = E.recommend(inp, S, [], fmt);
  S = E.advance(S, 'moved', r, inp).S;
  assert.equal(S.phase, 'ladder');
  assert.equal(S.lastOffer, 8000);
  r = E.recommend(inp, S, [], fmt);
  S = E.advance(S, 'stalled', r, inp).S;
  assert.equal(S.phase, 'ladder');
  r = E.recommend(inp, S, [], fmt);
  S = E.advance(S, 'stalled', r, inp).S;
  assert.equal(S.phase, 'pivot');
  r = E.recommend(inp, S, [], fmt);
  S = E.advance(S, 'stalled', r, inp).S;
  assert.deepEqual(S.given, ['agent']);
  assert.equal(S.round, 5);
});

test('signing records a ratio against the opening demand, in weekly terms', () => {
  const inp = inputs();
  let S = E.fresh();
  let r = E.recommend(inp, S, [], fmt);
  S = E.advance(S, 'moved', r, inp).S;
  // Switch the display to monthly mid-negotiation: the ratio should not change.
  const monthly = inputs({ period: 12, demand: demand({ wage: 9000 * 52 / 12 }) });
  r = E.recommend(monthly, S, [], fmt);
  const res = E.advance(S, 'accepted', r, monthly);
  assert.equal(res.S.round, 1);
  assert.ok(Math.abs(res.close.ratio - (r.offer.wage * 12 / 52) / 10000) < 1e-9);
});

test('measured opening factor takes over after three deals', () => {
  const closes = [0.9, 0.88, 0.92].map(ratio => ({ ctx: 'transfer', ratio }));
  const of = E.openingFactor(closes, 'transfer');
  assert.ok(of.measured);
  assert.equal(of.f, 0.82);
  assert.equal(E.openingFactor(closes, 'renewal').measured, false);
});

test('package cost applies yearly rises and partial years', () => {
  const inp = inputs({ years: 1.5, fixtures: 0 });
  const c = E.packageCost(inp, demand({ wage: 1000, rise: 10 }));
  assert.equal(Math.round(c.gtd), 52000 + 26000 * 1.1);
});

test('mergeCloses keeps existing deals and skips duplicates', () => {
  const a = [{ ctx: 'transfer', ratio: 0.9, at: 1 }];
  const m = E.mergeCloses(a, [{ ctx: 'transfer', ratio: 0.9, at: 1 }, { ctx: 'renewal', ratio: 0.95, at: 2 }]);
  assert.equal(m.added, 1);
  assert.equal(m.closes.length, 2);
});

test('normalizeSession rejects junk and cleans fields', () => {
  assert.equal(E.normalizeSession({ phase: 'nonsense', round: 1 }), null);
  const s = E.normalizeSession({ phase: 'pivot', round: 3, given: ['agent', 'evil'], lastOffer: 'x' });
  assert.deepEqual(s.given, ['agent']);
  assert.equal(s.lastOffer, null);
});

test('parseAmount handles grouping, decimals and suffixes', () => {
  assert.equal(E.parseAmount('12,000'), 12000);
  assert.equal(E.parseAmount('12.000'), 12000);
  assert.equal(E.parseAmount('1.250.000'), 1250000);
  assert.equal(E.parseAmount('1,250.50'), 1250.5);
  assert.equal(E.parseAmount('1.250,50'), 1250.5);
  assert.equal(E.parseAmount('1.5', 'M'), 1500000);
  assert.equal(E.parseAmount('12', 'k'), 12000);
});

test('screenshot text maps to the right terms and figures', () => {
  const text = [
    'Wage €15,000 p/w',
    'Wage After 20 Matches €18,000 p/w',
    'Yearly Wage Rise 10%',
    'Goalkeeper Coach 3',
    'Goal Bonus €1.2K',
    'Unused Substitute Fee €300',
    'Minimum Fee Release Clause €50M',
    'Signing-On Fee €250,000'
  ].join('\n');
  assert.deepEqual(E.findValues(text), {
    wage: 15000, wageafter: 18000, rise: 10, goal: 1200, sub: 300, release: 50000000, signon: 250000
  });
});

test('locked bonuses and a locked wage-after clause scale with the wage cut', () => {
  const inp = inputs({ demand: demand({ wage: 10000, goal: 1000, rise: 10, wageafter: 15000 }),
    locks: { goal: true, rise: true, wageafter: true } });
  const r = E.recommend(inp, E.fresh(), [], fmt);
  assert.equal(r.offer.wage, 8000);
  assert.equal(r.offer.goal, 800);
  assert.equal(r.offer.rise, 8);
  assert.equal(r.offer.wageafter, 12000);
});

test('an unlocked wage-after clause is removed', () => {
  const inp = inputs({ demand: demand({ wage: 10000, wageafter: 15000 }) });
  assert.equal(E.recommend(inp, E.fresh(), [], fmt).offer.wageafter, 0);
});

test('a clean sheet bonus costs money whatever the position', () => {
  const inp = inputs({ pos: 'att' });
  assert.ok(E.bonusSeason(inp, { csb: 1000 }, true) > 0);
});

test('bonus ceiling matches a hand calculation', () => {
  // Starter forward, 40 games: 0.92*40 = 36.8 apps, 31.28 goals, 11.04 assists, 16.56 clean sheets,
  // 3.2*0.15 = 0.48 unused-sub games.
  const inp = inputs({ fixtures: 40, role: 'starter', pos: 'att' });
  const season = E.bonusSeason(inp, { appfee: 100, goal: 1000, assist: 500, csb: 200, sub: 50 }, true);
  assert.ok(Math.abs(season - (3680 + 31280 + 5520 + 3312 + 24)) < 1e-6);
});
