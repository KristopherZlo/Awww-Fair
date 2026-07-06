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

  it("lays out the main menu like a game lobby", () => {
    const css = readAppCss();

    expect(css).toMatch(/\.menu-box\s*\{[\s\S]*grid-template-rows:\s*auto\s+auto\s+auto\s+minmax\(0,\s*1fr\)\s+auto;/);
    expect(css).toMatch(/\.menu-header\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto;/);
    expect(css).toMatch(/\.menu-header\s*\{[\s\S]*height:\s*78px;/);
    expect(css).toMatch(/\.menu-tabs\s*\{[\s\S]*align-self:\s*start;/);
    expect(css).toMatch(/\.menu-tabs\s*\{[\s\S]*flex-wrap:\s*nowrap;/);
    expect(css).toMatch(/\.menu-tabs button\s*\{[\s\S]*white-space:\s*nowrap;/);
    expect(css).toMatch(/\.play-tabs\s*\{[\s\S]*align-self:\s*start;/);
    expect(css).toMatch(/\.play-layout\s*\{[\s\S]*align-items:\s*stretch;/);
    expect(css).toMatch(/\.ranked-match-card\s*\{[\s\S]*grid-template-rows:\s*auto\s+minmax\(0,\s*1fr\)\s+auto;/);
    expect(css).toMatch(/\.ranked-button-time\s*\{[\s\S]*font-variant-numeric:\s*tabular-nums;/);
    expect(css).toMatch(/\.field-label\s*\{[\s\S]*display:\s*grid;/);
    expect(css).toMatch(/\.menu-field\s*\{[\s\S]*min-height:\s*44px;/);
    expect(css).toMatch(/\.custom-table-actions\s*\{[\s\S]*display:\s*grid;[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(260px,\s*340px\);/);
    expect(css).toMatch(/\.play-start-action\s*\{[\s\S]*align-self:\s*end;/);
    expect(css).toMatch(/\.play-start-button\s*\{[\s\S]*width:\s*min\(280px,\s*100%\);/);
    expect(css).toMatch(/\.menu-empty-state\s*\{[\s\S]*place-items:\s*center;/);
    expect(css).toMatch(/\.leaderboard-table\s*\{[\s\S]*width:\s*100%;/);
    expect(css).toMatch(/\.leaderboard-controls\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(220px,\s*320px\);/);
    expect(css).toMatch(/\.menu-utility-actions\s*\{[\s\S]*display:\s*flex;/);
    expect(css).toMatch(/\.match-history\s*\{[\s\S]*align-content:\s*start;/);
    expect(css).toMatch(/\.match-history h2\s*\{[\s\S]*font-size:\s*1rem;/);
    expect(css).toMatch(/\.profile-panel\.is-signed-in\s*\{[\s\S]*grid-template-columns:\s*1fr;/);
    expect(css).toMatch(/\.profile-tabs\s*\{[\s\S]*display:\s*flex;[\s\S]*border-bottom:\s*1px solid/);
    expect(css).toMatch(/\.profile-tabs\s+\[role="tab"\]\.active::after\s*\{[\s\S]*background:\s*#f7d99b;/);
    expect(css).toMatch(/\.profile-overview-stats\s*\{[\s\S]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\);/);
    expect(css).toMatch(/\.profile-mmr-chart\s*\{[\s\S]*width:\s*100%;/);
    expect(css).toMatch(/\.profile-main\s*\{[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/);
    expect(css).toMatch(/\.profile-settings-grid\s*\{[\s\S]*grid-template-columns:\s*1fr;/);
    expect(css).toMatch(/\.profile-avatar-editor\s*\{[\s\S]*grid-template-columns:\s*auto\s+minmax\(0,\s*1fr\);/);
    expect(css).toMatch(/@media \(max-width:\s*760px\)[\s\S]*\.profile-overview-stats[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/);
    expect(css).not.toMatch(/\.profile-avatar-card\s*\{/);
    expect(css).toMatch(/\.avatar-crop-backdrop\s*\{[\s\S]*position:\s*fixed;/);
    expect(css).toMatch(/\.avatar-crop-area\s*\{[\s\S]*aspect-ratio:\s*1\s*\/\s*1;/);
    expect(css).toMatch(/\.avatar-crop-area > img\s*\{[\s\S]*object-fit:\s*cover;/);
    expect(css).toMatch(/\.avatar-crop-box\s*\{[\s\S]*border-radius:\s*50%;/);
    expect(css).toMatch(/\.crop-grid-v\s*\{[\s\S]*display:\s*none;/);
    expect(css).toMatch(/\.crop-handle\s*\{[\s\S]*border-radius:\s*50%;/);
    expect(css).toMatch(/\.avatar-crop-actions button,\s*\.avatar-crop-actions \.profile-upload-button\s*\{[\s\S]*background:\s*rgba\(255,\s*250,\s*240,\s*0\.08\);[\s\S]*color:\s*#f8ead2;/);
    expect(css).toMatch(/\.avatar-crop-actions \.primary-action\s*\{[\s\S]*background:\s*#f7d99b;[\s\S]*color:\s*#20140c;/);
  });

  it("lets the story level road use the full available play panel height", () => {
    const css = readAppCss();
    const playLevelRoad = ruleBody(css, ".play-level-road");

    expect(playLevelRoad).toMatch(/height:\s*100%;/);
    expect(playLevelRoad).toMatch(/align-self:\s*stretch;/);
    expect(playLevelRoad).toMatch(/max-height:\s*none;/);
  });

  it("removes bottom padding from the story play mode card", () => {
    const css = readAppCss();
    const storyModeCard = ruleBody(css, ".menu-panel.play-mode-card.story-mode-card");

    expect(storyModeCard).toMatch(/padding-bottom:\s*0;/);
  });

  it("uses one shared size and style for play start buttons", () => {
    const css = readAppCss();
    const playStartButton = ruleBody(css, ".play-start-button");

    expect(playStartButton).toMatch(/display:\s*inline-flex;/);
    expect(playStartButton).toMatch(/justify-content:\s*center;/);
    expect(playStartButton).toMatch(/width:\s*min\(280px,\s*100%\);/);
    expect(playStartButton).toMatch(/min-height:\s*48px;/);
    expect(playStartButton).toMatch(/padding:\s*11px\s+16px;/);
    expect(playStartButton).toMatch(/background:\s*#f7d99b;/);
    expect(playStartButton).toMatch(/color:\s*#20140c;/);
    expect(playStartButton).toMatch(/font-size:\s*1\.02rem;/);
    expect(css).not.toMatch(/\.ranked-play-button\s*\{[\s\S]*?(width|min-height|padding|background|color|font-size):/);
  });

  it("stacks logged-out profile sign-in actions vertically", () => {
    const css = readAppCss();

    expect(css).toMatch(/\.oauth-actions,\s*\.dev-login-row\s*\{[\s\S]*grid-template-columns:\s*1fr;/);
  });

  it("styles the custom turn time range input like the menu controls", () => {
    const css = readAppCss();

    expect(css).toMatch(/\.custom-turn-time input\[type="range"\]\s*\{[\s\S]*-webkit-appearance:\s*none;[\s\S]*appearance:\s*none;[\s\S]*min-height:\s*44px;/);
    expect(css).toMatch(/\.custom-turn-time input\[type="range"\]\s*\{[\s\S]*accent-color:\s*#f7d99b;/);
    expect(css).toMatch(/\.custom-turn-time input\[type="range"\]::\-webkit-slider-runnable-track\s*\{[\s\S]*background:\s*rgba\(247,\s*217,\s*155,\s*0\.24\);/);
    expect(css).toMatch(/\.custom-turn-time input\[type="range"\]::\-webkit-slider-thumb\s*\{[\s\S]*-webkit-appearance:\s*none;[\s\S]*background:\s*#f7d99b;/);
    expect(css).toMatch(/\.custom-turn-time input\[type="range"\]::\-moz-range-thumb\s*\{[\s\S]*background:\s*#f7d99b;/);
  });

  it("dims disabled settings volume rows", () => {
    const css = readAppCss();

    expect(css).toMatch(/\.range-row:has\(input\[type="range"\]:disabled\)\s*\{[\s\S]*opacity:\s*0\.72;/);
  });

  it("lays out sale forecast toggles with an icon column", () => {
    const css = readAppCss();
    const toggle = ruleBody(css, ".sale-result-toggle");

    expect(toggle).toMatch(/display:\s*grid;/);
    expect(toggle).toMatch(/grid-template-columns:\s*14px\s+minmax\(0,\s*1fr\);/);
    expect(css).toMatch(/\.sale-result-chevron\s*\{[\s\S]*flex-shrink:\s*0;/);
    expect(css).not.toMatch(/\.sale-result-toggle::before[\s\S]*content:\s*"v"/);
    expect(css).not.toMatch(/\.sale-result-toggle::before[\s\S]*content:\s*">"/);
  });

  it("keeps expanded sales forecast rows readable", () => {
    const css = readAppCss();

    expect(css).toMatch(/\.sale-result-title,\s*\.sale-result-meta\s*\{[\s\S]*white-space:\s*normal;[\s\S]*overflow-wrap:\s*anywhere;/);
    expect(css).toMatch(/\.sale-result-body,\s*\.last-sale-review-body\s*\{[\s\S]*min-width:\s*0;/);
    expect(css).toMatch(/\.formula\s*\{[\s\S]*margin-top:\s*0;/);
    expect(css).toMatch(/\.formula b,\s*\.formula span,\s*\.formula strong\s*\{[\s\S]*overflow-wrap:\s*anywhere;/);
    expect(css).not.toMatch(/\.forecast-mode \.sale-result-card:not\(\.expanded\)[^{]*\{[^}]*min-height:\s*0;/);
  });

  it("caps leaderboard pagination buttons and embeds search icon in the field", () => {
    const css = readAppCss();

    expect(css).toMatch(/\.leaderboard-pagination button\s*\{[\s\S]*max-width:\s*124px;/);
    expect(css).toMatch(/\.leaderboard-search\s*\{[\s\S]*position:\s*relative;/);
    expect(css).toMatch(/\.leaderboard-search \.menu-field\s*\{[\s\S]*padding-right:\s*36px;/);
    expect(css).toMatch(/\.leaderboard-search-icon\s*\{[\s\S]*right:\s*11px;/);
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
