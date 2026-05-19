import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("app layout CSS", () => {
  it("lets the top bar define the first app row height from its content", () => {
    const css = readFileSync("src/styles.css", "utf8");

    expect(css).toMatch(
      /grid-template-rows:\s*auto\s+minmax\(52px,\s*max-content\)\s+minmax\(108px,\s*max-content\)\s+minmax\(clamp\(196px,\s*26vh,\s*230px\),\s*1fr\)\s+minmax\(252px,\s*max-content\);/
    );
    expect(css).toMatch(/\.top-bar\s*\{[\s\S]*min-height:\s*58px;/);
    expect(css).not.toMatch(/grid-template-rows:\s*58px\s+52px\s+96px/);
  });

  it("keeps customer and hand art large while the table stays compact", () => {
    const css = readFileSync("src/styles.css", "utf8");

    expect(css).toMatch(/\.table-grid\s*\{[\s\S]*align-self:\s*end;/);
    expect(css).toMatch(/\.table-grid\s*\{[\s\S]*min-height:\s*clamp\(196px,\s*26vh,\s*230px\);/);
    expect(css).toMatch(/\.customer-card\s*\{[\s\S]*width:\s*max-content;/);
    expect(css).toMatch(/\.customer-card \.sprite\s*\{[\s\S]*width:\s*92px;/);
    expect(css).toMatch(/\.hand-panel \.product-sprite\s*\{[\s\S]*width:\s*68px;/);
  });

  it("has invalid shelf slot feedback styles", () => {
    const css = readFileSync("src/styles.css", "utf8");

    expect(css).toMatch(/\.shelf-slot\.slot-unavailable/);
    expect(css).toMatch(/\.shelf-slot\.slot-rejecting/);
    expect(css).toMatch(/@keyframes shelf-reject/);
  });

  it("reserves enough hand panel height for influence controls", () => {
    const css = readFileSync("src/styles.css", "utf8");

    expect(css).toMatch(/minmax\(252px,\s*max-content\)/);
    expect(css).toMatch(/\.hand-panel\s*\{[\s\S]*min-height:\s*252px;/);
  });

  it("gives the event panel a three-fifths sales area and two-fifths log area", () => {
    const css = readFileSync("src/styles.css", "utf8");

    expect(css).toMatch(/\.event-panel\s*\{[\s\S]*grid-template-rows:\s*auto\s+minmax\(0,\s*3fr\)\s+auto\s+minmax\(0,\s*2fr\);/);
  });

  it("keeps selected card highlights inside cards so they are not clipped", () => {
    const css = readFileSync("src/styles.css", "utf8");

    expect(css).toMatch(/\.product-card\.selected,[\s\S]*\.influence-card\.selected\s*\{[\s\S]*outline:\s*none;[\s\S]*box-shadow:\s*inset 0 0 0 3px #f7d99b/);
    expect(css).toMatch(/\.coach-recommended\s*\{[\s\S]*outline:\s*none;[\s\S]*box-shadow:\s*inset 0 0 0 3px #bbf7d0/);
  });

  it("uses one stable top-bar control height", () => {
    const css = readFileSync("src/styles.css", "utf8");

    expect(css).toMatch(/\.top-actions > \*,[\s\S]*\.score-row > \*\s*\{[\s\S]*min-height:\s*44px;/);
    expect(css).toMatch(/\.settings-toggle\s*\{[\s\S]*min-height:\s*44px;/);
  });

  it("stretches top-bar groups and controls to the full bar height", () => {
    const css = readFileSync("src/styles.css", "utf8");

    expect(css).toMatch(/\.top-bar\s*\{[\s\S]*align-items:\s*stretch;/);
    expect(css).toMatch(/\.top-bar > \*\s*\{[\s\S]*align-self:\s*stretch;/);
    expect(css).toMatch(/\.sync-pill,[\s\S]*\.settings-toggle\s*\{[\s\S]*height:\s*100%;/);
  });

  it("styles native scrollbars to match the game interface", () => {
    const css = readFileSync("src/styles.css", "utf8");

    expect(css).toMatch(/scrollbar-color:\s*rgba\(247,\s*217,\s*155,\s*0\.72\)\s+rgba\(34,\s*23,\s*14,\s*0\.72\);/);
    expect(css).toMatch(/::\-webkit-scrollbar\s*\{[\s\S]*width:\s*10px;[\s\S]*height:\s*10px;/);
    expect(css).toMatch(/::\-webkit-scrollbar-thumb\s*\{[\s\S]*background:\s*linear-gradient\(180deg,\s*#f7d99b,\s*#c89443\);/);
  });

  it("keeps the main menu mode buttons vertical", () => {
    const css = readFileSync("src/styles.css", "utf8");

    expect(css).toMatch(/\.menu-primary-grid\s*\{[\s\S]*grid-template-columns:\s*1fr;/);
    expect(css).toMatch(/\.menu-online-row\s*\{[\s\S]*grid-template-columns:\s*1fr;/);
    expect(css).toMatch(/\.join-lobby\s*\{[\s\S]*display:\s*grid;[\s\S]*grid-template-columns:\s*1fr;/);
    expect(css).toMatch(/\.menu-network-divider\s*\{[\s\S]*height:\s*1px;/);
    expect(css).toMatch(/\.menu-footer-actions\s*\{[\s\S]*display:\s*grid;[\s\S]*grid-template-columns:\s*1fr;/);
    expect(css).toMatch(/\.menu-support-actions\s*\{[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/);
  });

  it("keeps the game-end actions on one row on desktop widths", () => {
    const css = readFileSync("src/styles.css", "utf8");

    expect(css).toMatch(/\.end-panel\s*\{[\s\S]*width:\s*min\(680px,\s*100%\);/);
  });

  it("centers cutscene subtitles and fades frame changes without a dark overlay", () => {
    const css = readFileSync("src/styles.css", "utf8");

    expect(css).toMatch(/\.cutscene-frame\s*\{[\s\S]*animation:\s*cutscene-frame-in/);
    expect(css).toMatch(/\.cutscene-subtitles\s*\{[\s\S]*justify-items:\s*center;/);
    expect(css).toMatch(/\.cutscene-subtitles p\s*\{[\s\S]*text-align:\s*center;/);
    expect(css).toMatch(/@keyframes cutscene-frame-in/);
    expect(css).not.toMatch(/\.cutscene-overlay::after/);
  });
});
