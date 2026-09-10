# Contract Room

A negotiation assistant for Football Manager 2026. You type in what a player is demanding, it tells you what to offer back, and you repeat until he signs.

No install, no dependencies, no build step. One HTML file that runs offline.

**[Open the tool](https://YOUR-USERNAME.github.io/fm26-contract-room/)**

## The problem it solves

The wage is the number everyone negotiates over, and it's the wrong one to focus on. Bonuses in FM26 don't count against your wage budget, so a deal can sit comfortably inside budget while quietly costing more than the wage does. Appearance fees, goal bonuses and unused-sub fees trigger on every occurrence, which means they scale up precisely when the signing works out.

Worse, they're uncapped. A €900 appearance fee looks harmless next to a €12k wage, but across 46 fixtures and a four-year deal it's a six-figure liability that never shows up anywhere you'd normally look.

Contract Room prices the whole package, then drives the negotiation toward the cheapest structure the agent will actually sign.

## How the algorithm works

Four phases. It never haggles over the wage before it has stripped the deal.

**Opening.** Set the contract length and squad status first, since both are reported to reduce the wage before you've argued about it. Strip every unlocked bonus, in order of what each costs when the signing succeeds: unused sub fee, appearance fee, yearly wage rise, then goal and assist bonuses. Zero the agent fee, signing-on fee and loyalty bonus — those are held back as currency. Then open the wage at a fraction of the demand: 80% for a transfer target, 65% for a free agent, 85% for a renewal.

**Ladder.** Bisect between your last offer and wherever the agent has landed.

**Pivot.** After a configurable number of rounds with no movement, the wage freezes. Instead of climbing, the tool hands back the withheld lump sums one at a time, cheapest first. A one-off payment never scales with how well the player performs; a wage rise does.

**Walk away.** Out of concessions, it tells you to end talks and return in about a week.

Locked terms are handled rather than ignored. A locked wage-after-X-matches clause gets scaled in proportion to the wage rather than stripped. A locked release clause gets pushed up rather than removed, since a clause near market value destroys resale value — which costs a sell-on-model save far more than the wage ever will.

## Costing without forecasting

The tool never asks you to predict a season. It asks for your fixture count, which is a known number, plus the role you'll give the player and his position. From that it computes a range: the floor is a bad season, the ceiling is an ever-present one.

The ceiling is the number that matters, because nothing in the game caps a bonus.

## Calibration

Every deal you close logs the ratio between what you signed at and what was first demanded, bucketed by situation. After three closes in a bucket, the tool replaces the community-guessed opening factor with your own measured average minus eight points, and the table shows you which of the two is driving the recommendation.

This is the point of the project. The published advice about FM26 negotiation is mostly from the game's launch window, and the game has been patched heavily since. Rather than pretend otherwise, the tool converts guesses into your own measured data as you use it.

Data persists between sessions in browsers that allow local storage, including normal local-file use in most browsers. Use the export button as a portable backup or when storage is blocked.

## Running it

Clone and open `index.html` in any browser. That's the whole setup.

To host it, enable GitHub Pages on the repo: Settings → Pages → deploy from `main`, root folder.

## What's evidence and what's a guess

Everything in the tool is tagged in the notes at the bottom of the page. In short:

**Reported by the community**, mostly from October to December 2025:

- Agents in FM26 resist moving on base wage but will drop or remove peripheral demands. This is why the wage ladder is short and the stripping does the work.
- Bonuses sit outside the wage budget.
- Longer contracts and higher squad status both reduce wage demands.
- Raising the agent fee instead of the wage converts a recurring cost into a one-off.
- Walking away and returning about a week later often produces a softer demand.
- A negotiation bug where editing any part of a softened proposal reverts the demand to its original figure.

**My assumptions, untested:**

- The strip order and the concession order. Both are ranked by cost when the signing succeeds, not by measured agent resistance.
- The role bands (a nailed-on starter playing 55–92% of fixtures, rotation 30–62%) and the per-appearance goal and assist rates. Deliberately wide. They live in the `ROLE` and `POS` tables at the top of the script and are two lines to change.
- 52-week contract years, no mid-contract status changes.

One deliberate omission: sell-on percentages are never used as a sweetener, even though community guides suggest them. They tax the exit, and for a develop-and-sell save the exit is the point.

## Sources

- [How to assess the overall value of a contract](https://sortitoutsi.net/content/75640/fm26-how-to-asses-the-overall-value-of-a-contract) — sortitoutsi, on how bonuses behave and why they escape the wage budget
- [The art of negotiating in Football Manager 26](https://www.operationsports.com/the-art-of-negotiating-in-football-manager-26/) — Operation Sports, on using bonuses to hold guaranteed pay down
- [Wage demands at renewal](https://steamcommunity.com/app/3551340/discussions/0/670599487628068907/) — Steam discussion, the sticky-wage observation
- [FM26 guide: buying players](https://sortitoutsi.net/content/76697/fm26-guide-buying-players) — sortitoutsi, negotiation structure
- [Players negotiation](https://fm-arena.com/thread/5544-players-negotiation/) — FM-Arena, the original strip-and-bisect method from an earlier FM version, which this adapts
- [Contract and transfer negotiation bugs](https://community.sports-interactive.com/bugtracker/1644_football-manager-26-bugs-tracker/1883_transfer-scouting-contracts-intermediaries/many-contract-and-transfer-negotiation-bugs-as-well-as-unrealistic-aspects-r39546/) — SI bug tracker, the demand-reset behaviour

## Contributing

The most useful contribution isn't code. If you run a negotiation through it, open an issue with your situation type, the opening demand, what you closed at, how many rounds it took, and your game version. Enough of those and the default opening factors can be based on measurements rather than forum posts.

Bug reports and pull requests welcome. Keep it a single dependency-free file.

## Licence

MIT. See [LICENSE](LICENSE).

Not affiliated with, endorsed by, or connected to Sports Interactive or Sega. Football Manager is their trademark. This is an unofficial fan tool that reads nothing from your save and modifies nothing in the game.
