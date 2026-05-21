import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

function readCssWithImports(filePath, seen = new Set()) {
  if (seen.has(filePath)) {
    return "";
  }

  seen.add(filePath);
  const css = readFileSync(filePath, "utf8");
  return css.replace(/@import\s+"([^"]+)";/g, (_match, importPath) => readCssWithImports(join(dirname(filePath), importPath), seen));
}

function readAppCss() {
  return readCssWithImports("src/styles.css");
}

function ruleBody(css, selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`^${escapedSelector}\\s*\\{([\\s\\S]*?)^\\}`, "m"));
  expect(match).toBeTruthy();
  return match?.[1] ?? "";
}

describe("app layout CSS", () => {
  it("lets the top bar define the first app row height from its content", () => {
    const css = readAppCss();

    expect(css).toMatch(
      /grid-template-rows:\s*auto\s+minmax\(52px,\s*max-content\)\s+minmax\(108px,\s*max-content\)\s+minmax\(clamp\(196px,\s*26vh,\s*230px\),\s*1fr\)\s+minmax\(252px,\s*max-content\);/
    );
    expect(css).toMatch(/\.top-bar\s*\{[\s\S]*min-height:\s*58px;/);
    expect(css).not.toMatch(/grid-template-rows:\s*58px\s+52px\s+96px/);
  });

  it("keeps customer and hand art large while the table stays compact", () => {
    const css = readAppCss();

    expect(css).toMatch(/\.table-grid\s*\{[\s\S]*align-self:\s*end;/);
    expect(css).toMatch(/\.table-grid\s*\{[\s\S]*min-height:\s*clamp\(196px,\s*26vh,\s*230px\);/);
    expect(css).toMatch(/\.customer-card\s*\{[\s\S]*width:\s*max-content;/);
    expect(css).toMatch(/\.customer-card \.sprite\s*\{[\s\S]*width:\s*92px;/);
    expect(css).toMatch(/\.hand-panel \.product-sprite\s*\{[\s\S]*width:\s*68px;/);
  });

  it("raises personality tooltips above neighboring customer cards", () => {
    const css = readAppCss();

    expect(css).toMatch(/\.customer-card\s*\{[\s\S]*position:\s*relative;[\s\S]*z-index:\s*0;/);
    expect(css).toMatch(/\.customer-card:hover,[\s\S]*\.customer-card:focus-within\s*\{[\s\S]*z-index:\s*16;/);
    expect(css).toMatch(/\.personality-tooltip\s*\{[\s\S]*max-width:\s*min\(220px,\s*calc\(100vw - 24px\)\);/);
  });

  it("has invalid shelf slot feedback styles", () => {
    const css = readAppCss();

    expect(css).toMatch(/\.shelf-slot\.slot-unavailable/);
    expect(css).toMatch(/\.shelf-slot\.slot-rejecting/);
    expect(css).toMatch(/@keyframes shelf-reject/);
  });

  it("reserves enough hand panel height for influence controls", () => {
    const css = readAppCss();

    expect(css).toMatch(/minmax\(252px,\s*max-content\)/);
    expect(css).toMatch(/\.hand-panel\s*\{[\s\S]*min-height:\s*252px;/);
  });

  it("lets the hand panel grow with its content", () => {
    const css = readAppCss();
    const handPanel = ruleBody(css, ".hand-panel");
    const handColumns = ruleBody(css, ".hand-columns");

    expect(handPanel).toMatch(/grid-template-rows:\s*auto\s+auto\s+auto;/);
    expect(handPanel).toMatch(/overflow:\s*visible;/);
    expect(handPanel).not.toMatch(/minmax\(0,\s*1fr\)/);
    expect(handColumns).toMatch(/min-height:\s*auto;/);
    expect(handColumns).toMatch(/overflow:\s*visible;/);
  });

  it("gives the event panel a three-fifths sales area and two-fifths log area", () => {
    const css = readAppCss();

    expect(css).toMatch(/\.event-panel\s*\{[\s\S]*grid-template-rows:\s*auto\s+minmax\(0,\s*3fr\)\s+auto\s+minmax\(0,\s*2fr\);/);
  });

  it("keeps selected card highlights inside cards so they are not clipped", () => {
    const css = readAppCss();

    expect(css).toMatch(/\.product-card\.selected,[\s\S]*\.influence-card\.selected\s*\{[\s\S]*outline:\s*none;[\s\S]*box-shadow:\s*inset 0 0 0 3px #f7d99b/);
    expect(css).toMatch(/\.coach-recommended\s*\{[\s\S]*outline:\s*none;[\s\S]*box-shadow:\s*inset 0 0 0 3px #bbf7d0/);
  });

  it("uses one stable top-bar control height", () => {
    const css = readAppCss();

    expect(css).toMatch(/\.top-actions > \*,[\s\S]*\.score-row > \*\s*\{[\s\S]*min-height:\s*44px;/);
    expect(css).toMatch(/\.settings-toggle\s*\{[\s\S]*min-height:\s*44px;/);
  });

  it("stretches top-bar groups and controls to the full bar height", () => {
    const css = readAppCss();

    expect(css).toMatch(/\.top-bar\s*\{[\s\S]*align-items:\s*stretch;/);
    expect(css).toMatch(/\.top-bar > \*\s*\{[\s\S]*align-self:\s*stretch;/);
    expect(css).toMatch(/\.sync-pill,[\s\S]*\.settings-toggle\s*\{[\s\S]*height:\s*100%;/);
  });

  it("styles native scrollbars to match the game interface", () => {
    const css = readAppCss();

    expect(css).toMatch(/scrollbar-color:\s*rgba\(247,\s*217,\s*155,\s*0\.72\)\s+rgba\(34,\s*23,\s*14,\s*0\.72\);/);
    expect(css).toMatch(/::\-webkit-scrollbar\s*\{[\s\S]*width:\s*10px;[\s\S]*height:\s*10px;/);
    expect(css).toMatch(/::\-webkit-scrollbar-thumb\s*\{[\s\S]*background:\s*linear-gradient\(180deg,\s*#f7d99b,\s*#c89443\);/);
  });

  it("keeps the main menu mode buttons vertical", () => {
    const css = readAppCss();

    expect(css).toMatch(/\.menu-primary-grid\s*\{[\s\S]*grid-template-columns:\s*1fr;/);
    expect(css).toMatch(/\.menu-online-row\s*\{[\s\S]*grid-template-columns:\s*1fr;/);
    expect(css).toMatch(/\.join-lobby\s*\{[\s\S]*display:\s*grid;[\s\S]*grid-template-columns:\s*1fr;/);
    expect(css).toMatch(/\.menu-footer-actions\s*\{[\s\S]*display:\s*grid;[\s\S]*grid-template-columns:\s*1fr;/);
    expect(css).toMatch(/\.menu-support-actions\s*\{[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/);
  });

  it("keeps the game-end actions on one row on desktop widths", () => {
    const css = readAppCss();

    expect(css).toMatch(/\.end-panel\s*\{[\s\S]*width:\s*min\(680px,\s*100%\);/);
  });

  it("centers cutscene subtitles and fades frame changes without a dark overlay", () => {
    const css = readAppCss();

    expect(css).toMatch(/\.cutscene-frame\s*\{[\s\S]*animation:\s*cutscene-frame-in/);
    expect(css).toMatch(/\.cutscene-subtitles\s*\{[\s\S]*justify-items:\s*center;/);
    expect(css).toMatch(/\.cutscene-subtitles p\s*\{[\s\S]*text-align:\s*center;/);
    expect(css).toMatch(/@keyframes cutscene-frame-in/);
    expect(css).not.toMatch(/\.cutscene-overlay::after/);
  });

  it("keeps long rules readable inside a scrollable modal", () => {
    const css = readAppCss();

    expect(css).toMatch(/\.rules-modal\s*\{[\s\S]*max-height:\s*calc\(100dvh - 32px\);[\s\S]*overflow:\s*hidden;/);
    expect(css).toMatch(/\.rules-modal ol\s*\{[\s\S]*min-height:\s*0;[\s\S]*overflow:\s*auto;/);
  });

  it("lets short desktop viewports scroll to bottom hand controls", () => {
    const css = readAppCss();

    expect(css).toMatch(/@media\s*\(max-height:\s*760px\)\s*\{[\s\S]*body\s*\{[\s\S]*overflow:\s*auto;/);
    expect(css).toMatch(/@media\s*\(max-height:\s*760px\)\s*\{[\s\S]*\.app-shell\s*\{[\s\S]*height:\s*auto;[\s\S]*overflow:\s*visible;/);
  });
});
