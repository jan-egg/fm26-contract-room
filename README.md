# Contract Room

A small negotiation assistant for Football Manager 2026. Enter the player's demand and it suggests what to offer next, including the cost of bonuses over the full contract.

There is no build step. Open `index.html` directly, or host the folder with GitHub Pages.

**[Open the tool](https://YOUR-USERNAME.github.io/fm26-contract-room/)**

## What it does

FM26 bonuses sit outside the wage budget, but can trigger repeatedly across a contract. Contract Room estimates the guaranteed cost and the bonus exposure, then tries to reduce the expensive recurring terms before raising the wage.

You can also paste or upload a contract screenshot. The optional OCR reader suggests values for the demand sheet; review them before applying anything.

## How to use it

1. Enter the current demand, or read it from a screenshot.
2. Set the contract length, expected role, position, and season fixture count.
3. Follow the suggested offer and record whether the agent moved, stalled, or accepted.
4. Use **Export my data** for a backup or to move calibration data to another browser.

The negotiation has four stages:

- **Opening:** remove unlocked recurring bonuses and start below the demand.
- **Ladder:** split the difference when the agent moves.
- **Pivot:** freeze the wage and use one-off concessions when the wage stops moving.
- **Walk away:** stop when the available concessions are exhausted.

Locked clauses are called out rather than silently removed.

## Cost estimates

The tool does not try to predict a season. It uses your fixture count, the player's role, and his position to show a range:

- **Floor:** a poor season.
- **Ceiling:** the player triggers everything across the full fixture list.

Treat the ceiling seriously because these bonuses are not capped.

## Calibration and OCR

Each accepted deal records the final wage as a ratio of the opening demand. After three deals in the same situation, your measured data replaces the default opening factor.

Calibration is saved in browser storage when available. Export it before clearing browser data or moving to another device.

Screenshot OCR is optional and loads Tesseract from jsDelivr the first time you use it. The tool still works without OCR, including when offline.

## Privacy and security

There is no server or account. Screenshots are read in your browser and are not sent to this project. Calibration data stays in browser storage unless you export it. The OCR feature does download a pinned Tesseract script from jsDelivr, so disable OCR or use a trusted local copy if your environment does not allow third-party scripts.

## Running it

Open `index.html` in a browser. To publish it, enable GitHub Pages and deploy the repository from the `main` branch and root folder.

## What is certain, and what is not

The page labels reported information and assumptions separately. The broad ideas come from community testing: bonuses are outside the wage budget, agents often give more ground on extras than on base wage, and one-off fees can be better than recurring costs.

The exact stripping order, concession order, role bands, scoring rates, and opening percentages are assumptions. They are deliberately easy to change in the script. The tool also assumes 52-week contract years and does not use sell-on clauses as a sweetener.

Treat every OCR result as a suggestion, not as a trusted transcription.

## Sources

- [How to assess the overall value of a contract](https://sortitoutsi.net/content/75640/fm26-how-to-asses-the-overall-value-of-a-contract) — sortitoutsi, on how bonuses behave and why they escape the wage budget
- [The art of negotiating in Football Manager 26](https://www.operationsports.com/the-art-of-negotiating-in-football-manager-26/) — Operation Sports, on using bonuses to hold guaranteed pay down
- [Wage demands at renewal](https://steamcommunity.com/app/3551340/discussions/0/670599487628068907/) — Steam discussion, the sticky-wage observation
- [FM26 guide: buying players](https://sortitoutsi.net/content/76697/fm26-guide-buying-players) — sortitoutsi, negotiation structure
- [Players negotiation](https://fm-arena.com/thread/5544-players-negotiation/) — FM-Arena, the original strip-and-bisect method from an earlier FM version, which this adapts
- [Contract and transfer negotiation bugs](https://community.sports-interactive.com/bugtracker/1644_football-manager-26-bugs-tracker/1883_transfer-scouting-contracts-intermediaries/many-contract-and-transfer-negotiation-bugs-as-well-as-unrealistic-aspects-r39546/) — SI bug tracker, the demand-reset behaviour

## Contributing

The most useful contribution is a real negotiation result. Open an issue with the situation type, opening demand, final deal, number of rounds, and game version. That makes the default opening factors less dependent on forum posts.

Bug reports and pull requests are welcome. Keep the app lightweight and dependency-free at build time.

## Licence

MIT. See [LICENSE](LICENSE).

Not affiliated with, endorsed by, or connected to Sports Interactive or Sega. Football Manager is their trademark. This is an unofficial fan tool that reads nothing from your save and modifies nothing in the game.
