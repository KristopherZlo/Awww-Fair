import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App, { randomAiTurnDelayMs } from "./App";
import { clearImagePreloadCacheForTest } from "./assetPreloader";
import { CUSTOMER_CARDS, INFLUENCE_CARDS, PRODUCT_CARDS, TREND_CARDS, UPGRADE_CARDS } from "./data/cards";
import { customerPersonalityDescription } from "./i18n";
import type { PartyGoal } from "./game/goals";
import type { PlayerId, PlayerState, ProductCard, ProductInstance } from "./game/types";

class MockAudio {
  src: string;
  preload = "";
  loop = false;
  volume = 1;
  currentTime = 0;
  paused = true;
  private listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();

  constructor(src = "") {
    this.src = src;
    mockAudioInstances.push(this);
  }

  play = vi.fn(() => {
    this.paused = false;
    return undefined;
  });

  pause = vi.fn(() => {
    this.paused = true;
  });

  addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    const listeners = this.listeners.get(type) ?? new Set<EventListenerOrEventListenerObject>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type: string) {
    this.listeners.get(type)?.forEach((listener) => {
      if (typeof listener === "function") {
        listener(new Event(type));
      } else {
        listener.handleEvent(new Event(type));
      }
    });
  }
}

let mockAudioInstances: MockAudio[] = [];
let mockImageSources: string[] = [];

class MockImage {
  decoding = "";
  private currentSrc = "";

  get src() {
    return this.currentSrc;
  }

  set src(value: string) {
    this.currentSrc = value;
    mockImageSources.push(value);
  }
}

function expectImagePreloaded(assetName: string) {
  expect(mockImageSources.some((source) => source.includes(assetName))).toBe(true);
}

function buttonFromSelector(container: HTMLElement, selector: string) {
  const button = container.querySelector(selector);
  expect(button).toBeInstanceOf(HTMLButtonElement);
  return button as HTMLButtonElement;
}

function productInstance(card: ProductCard, suffix: string): ProductInstance {
  return {
    instanceId: `${card.id}-${suffix}`,
    cardId: card.id,
    name: card.name,
    type: card.type,
    tags: card.tags,
    price: card.price,
    stock: card.stock,
    baseStock: card.stock,
    sprite: card.sprite
  };
}

function testPlayer(id: PlayerId): PlayerState {
  return {
    id,
    name: id,
    money: 0,
    sales: 0,
    shelfSlots: 3,
    shelf: [null, null, null],
    productHand: [productInstance(PRODUCT_CARDS[id === "A" ? 0 : 1], id)],
    influenceHand: [INFLUENCE_CARDS[0]],
    upgrades: [],
    planned: false,
    productActionUsed: false,
    influenceActionUsed: false,
    tableBonusUsed: false,
    color: id === "A" ? "red" : "blue"
  };
}

const completedGoalForB: PartyGoal = {
  id: "clean-sale",
  title: "Продажа без влияний",
  kind: "no_influence_sale",
  target: 1,
  progress: 1,
  completed: true,
  reward: 2,
  rewardClaimed: true,
  completedBy: "B"
};

function saveGameState(
  overrides: Record<string, unknown>,
  lobby: Record<string, unknown> | null = null,
  audioSettingsOverrides: Record<string, unknown> = {}
) {
  const state = {
    phase: "planning",
    round: 1,
    firstPlayer: "A",
    activePlayer: "A",
    players: [testPlayer("A"), testPlayer("B")],
    productDeck: [productInstance(PRODUCT_CARDS[2], "deck")],
    influenceDeck: INFLUENCE_CARDS.slice(1, 2),
    customerDeck: CUSTOMER_CARDS.slice(1, 2),
    trendDeck: TREND_CARDS.slice(3, 4),
    upgradeDeck: [],
    activeTrends: TREND_CARDS.slice(0, 3),
    currentCustomers: CUSTOMER_CARDS.slice(0, 1),
    playedInfluences: [],
    roundBonuses: [],
    saleResults: [],
    saleInsights: [],
    logs: [],
    selectedProductId: null,
    selectedInfluenceId: null,
    selectedTag: "сладкое",
    upgradeOffer: [],
    upgradeQueue: [],
    choiceDraft: null,
    pause: { active: false, pausedBy: null },
    partyGoals: [completedGoalForB],
    sound: true,
    aiPlayerId: null,
    aiMode: null,
    aiScore: 0,
    aiIntent: null,
    ...overrides
  };

  window.localStorage.setItem(
    "trend-market-session-v1",
    JSON.stringify({
      version: 1,
      state,
      lobby,
      audioSettings: {
        musicEnabled: true,
        effectsEnabled: true,
        musicVolume: 0.3,
        effectsVolume: 1,
        turnTimeSeconds: 45,
        ...audioSettingsOverrides
      }
    })
  );
}

describe("App layout shell", () => {
  beforeEach(() => {
    vi.useRealTimers();
    window.localStorage.clear();
    mockAudioInstances = [];
    mockImageSources = [];
    clearImagePreloadCacheForTest();
    Object.defineProperty(window, "Audio", {
      configurable: true,
      value: MockAudio as unknown as typeof Audio
    });
    Object.defineProperty(window, "Image", {
      configurable: true,
      value: MockImage as unknown as typeof Image
    });
    Object.defineProperty(window, "AudioContext", {
      configurable: true,
      value: undefined
    });
    Object.defineProperty(window, "webkitAudioContext", {
      configurable: true,
      value: undefined
    });
    Object.defineProperty(window.HTMLMediaElement.prototype, "play", {
      configurable: true,
      value: vi.fn().mockResolvedValue(undefined)
    });
    Object.defineProperty(window.HTMLMediaElement.prototype, "pause", {
      configurable: true,
      value: vi.fn()
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function playUntilGameEnd(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: /2 игрока/i }));

    for (let step = 0; step < 80; step += 1) {
      if (screen.queryByText(/Вы победили|Вы проиграли|Ничья/i)) {
        return;
      }

      const ready = screen.queryByRole("button", { name: /Готов/i });
      if (ready instanceof HTMLButtonElement && !ready.disabled) {
        await user.click(ready);
        continue;
      }

      const continueButton = screen.queryByRole("button", { name: /Продолжить/i });
      if (continueButton instanceof HTMLButtonElement && !continueButton.disabled) {
        await user.click(continueButton);
        continue;
      }

      const skip = screen.queryByRole("button", { name: /Пропустить/i });
      if (skip instanceof HTMLButtonElement && !skip.disabled) {
        await user.click(skip);
        continue;
      }
    }

    throw new Error("Game did not reach end screen");
  }

  it("marks the current game phase on the shell for responsive layout rules", () => {
    const { container } = render(<App />);
    const shell = container.querySelector(".app-shell");

    expect(shell).not.toBeNull();
    expect(shell?.classList.contains("phase-menu")).toBe(true);
  });

  it("uses Awww Fair: Hat Hustle as the visible game title", () => {
    render(<App />);

    expect(screen.getAllByRole("heading", { name: "Awww Fair: Hat Hustle", level: 1 }).length).toBeGreaterThan(0);
  });

  it("explains the rules like a clear board-game manual", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: /Правила/i }));

    const rules = screen.getByText(/Цель игры:/i).closest(".rules-modal");
    expect(rules).not.toBeNull();

    expect(screen.getByText(/Цель игры: после 8 раундов иметь больше монет/i)).toBeInTheDocument();
    expect(screen.getByText(/Раунд: в 1-2 раундах приходит 1 клиент/i)).toBeInTheDocument();
    expect(screen.getByText(/В свой ход выставь или замени 1 товар/i)).toBeInTheDocument();
    expect(screen.getByText(/Подсчёт привлекательности: главный тег клиента даёт \+3/i)).toBeInTheDocument();
    expect(screen.getByText(/Тренды не заменяют желания клиента/i)).toBeInTheDocument();
    expect(screen.getByText(/Главный тренд сильнее обычного/i)).toBeInTheDocument();
    expect(screen.getByText(/Клиент покупает только товар, который набрал минимум 5/i)).toBeInTheDocument();
    expect(screen.getByText(/Если несколько товаров подходят/i)).toBeInTheDocument();
    expect(screen.getByText(/Характеры клиентов:/i)).toBeInTheDocument();
    expect(screen.getByText(/Почти равный выбор.*товар со вторым результатом/i)).toBeInTheDocument();
    expect(screen.getByText(/При продаже ты получаешь цену товара/i)).toBeInTheDocument();
    expect(screen.getByText(/Цели партии дают \+2 монеты/i)).toBeInTheDocument();
    expect(screen.getByText(/В режиме истории часть механик может быть временно отключена/i)).toBeInTheDocument();
    expect(within(rules as HTMLElement).queryByText(/2-й вариант|второй вариант/i)).not.toBeInTheDocument();
  });

  it("labels local player as you and the other seat as opponent", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getAllByText("Вы").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Оппонент").length).toBeGreaterThan(0);
    expect(screen.queryByText(/Игрок A|Игрок B/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Против ИИ/i }));
    await user.click(screen.getByRole("button", { name: /Зазывала/i }));

    expect(screen.getByText(/ИИ: Оппонент/i)).toBeInTheDocument();
    expect(screen.queryByText(/ИИ игрок B/i)).not.toBeInTheDocument();
  });

  it("switches the shell layout class when the planning phase starts", async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    await user.click(screen.getByRole("button", { name: /2 игрока/i }));

    expect(container.querySelector(".app-shell")?.classList.contains("phase-planning")).toBe(true);
  });

  it("labels local hotseat turns by player id", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: /2 игрока/i }));

    expect(screen.getByRole("heading", { name: /Ход игрока [AB]/i })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /Ваш ход!/i })).not.toBeInTheDocument();
  });

  it("labels the local controlled turn as yours outside hotseat mode", () => {
    saveGameState({ activePlayer: "A", aiPlayerId: "B" });

    render(<App />);

    expect(screen.getByRole("heading", { name: /^Ваш ход!$/i })).toBeInTheDocument();
  });

  it("restores an active local game after a page reload", async () => {
    const user = userEvent.setup();
    const firstRender = render(<App />);

    await user.click(screen.getByRole("button", { name: /2 игрока/i }));

    await waitFor(() => {
      const savedSession = window.localStorage.getItem("trend-market-session-v1");
      expect(savedSession).not.toBeNull();
      expect(savedSession ?? "").toContain('"phase":"planning"');
    });
    expect(firstRender.container.querySelector(".app-shell")?.classList.contains("phase-planning")).toBe(true);

    firstRender.unmount();
    const secondRender = render(<App />);

    expect(secondRender.container.querySelector(".app-shell")?.classList.contains("phase-planning")).toBe(true);
    expect(screen.getByLabelText(/Таймер хода/i)).toHaveTextContent(/Ход: 00:45/i);
    expect(screen.queryByRole("button", { name: /2 игрока/i })).not.toBeInTheDocument();
  });

  it("shows a read-only sales forecast during planning", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: /2 игрока/i }));

    expect(screen.getByText(/прогноз продаж/i)).toBeInTheDocument();
    expect(screen.getByText(/если считать сейчас/i)).toBeInTheDocument();
    expect(screen.getAllByText(/0/).length).toBeGreaterThan(0);
  });

  it("shows three party goals when a game starts", async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    await user.click(screen.getByRole("button", { name: /2 игрока/i }));

    expect(screen.getByText(/Цели партии/i)).toBeInTheDocument();
    expect(container.querySelectorAll(".party-goal")).toHaveLength(3);
    expect(screen.queryByText(/награда/i)).not.toBeInTheDocument();
  });

  it("hides upcoming customer and trend previews during the last round", () => {
    const { container } = render(<App />);

    expect(container.querySelector(".preview-card")).not.toBeNull();
    expect(container.querySelector(".next-customer")).not.toBeNull();

    window.localStorage.clear();
    saveGameState({ round: 8 });

    const lastRound = render(<App />);

    expect(lastRound.container.querySelector(".preview-card")).toBeNull();
    expect(lastRound.container.querySelector(".next-customer")).toBeNull();
  });

  it("marks completed party goals red for the local player when the opponent earned them and green for the earner", () => {
    saveGameState({ partyGoals: [completedGoalForB] });
    const localA = render(<App />);

    expect(localA.container.querySelector(".party-goal.completed-by-opponent")).not.toBeNull();
    expect(localA.container.querySelector(".party-goal.completed-by-you")).toBeNull();

    localA.unmount();
    window.localStorage.clear();
    saveGameState({ activePlayer: "B", aiPlayerId: "A", partyGoals: [completedGoalForB] });
    const localB = render(<App />);

    expect(localB.container.querySelector(".party-goal.completed-by-you")).not.toBeNull();
    expect(localB.container.querySelector(".party-goal.completed-by-opponent")).toBeNull();
  });

  it("pauses the whole game, freezes the timer, and resumes it", async () => {
    vi.useFakeTimers();
    render(<App />);

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /2 игрока/i }));
    });

    expect(screen.getByLabelText(/Таймер хода/i)).toHaveTextContent(/Ход: 00:45/i);

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /Пауза/i }));
    });

    expect(screen.getByRole("dialog", { name: /Пауза/i })).toBeInTheDocument();
    expect(mockAudioInstances[0].volume).toBeCloseTo(0.03);

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.getByText(/Ход: 00:45/i)).toBeInTheDocument();

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /Продолжить/i }));
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getByLabelText(/Таймер хода/i)).toHaveTextContent(/Ход: 00:44/i);
  });

  it("exits from pause to the main menu and clears the saved active game", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: /2 игрока/i }));
    await waitFor(() => expect(window.localStorage.getItem("trend-market-session-v1")).toContain('"phase":"planning"'));

    await user.click(screen.getByRole("button", { name: /Пауза/i }));
    await user.click(screen.getByRole("button", { name: /Выйти в меню/i }));

    expect(screen.getByRole("dialog", { name: /Выйти в меню/i })).toBeInTheDocument();
    expect(screen.getByText(/Вы действительно хотите выйти/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Остаться$/i }));
    expect(screen.getByRole("dialog", { name: /Пауза/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Выйти в меню/i }));
    await user.click(screen.getByRole("button", { name: /^Выйти$/i }));

    expect(screen.getByRole("button", { name: /2 игрока/i })).toBeInTheDocument();
    await waitFor(() => expect(window.localStorage.getItem("trend-market-session-v1")).toBeNull());
  });

  it("keeps in-game settings inside a vertical pause menu", async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    await user.click(screen.getByRole("button", { name: /2 игрока/i }));

    const topBar = container.querySelector(".top-bar");
    expect(topBar).not.toBeNull();
    expect(within(topBar as HTMLElement).queryByRole("button", { name: /Настройки/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Пауза/i }));

    const pauseDialog = screen.getByRole("dialog", { name: /Пауза/i });
    const pauseActions = container.querySelector(".pause-actions");
    expect(pauseActions).not.toBeNull();
    expect(pauseActions?.querySelectorAll("button")).toHaveLength(3);
    expect(container.querySelector(".pause-settings")).toBeNull();

    await user.click(within(pauseDialog).getByRole("button", { name: /Настройки/i }));

    expect(screen.getByRole("dialog", { name: /Настройки/i })).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: /Громкость музыки/i })).toBeInTheDocument();
  });

  it("keeps the event panel in the app grid instead of inside the table", () => {
    const { container } = render(<App />);
    const shell = container.querySelector(".app-shell");
    const table = container.querySelector(".table-grid");
    const eventPanel = container.querySelector(".event-panel");

    expect(eventPanel?.parentElement).toBe(shell);
    expect(table?.querySelector(".event-panel")).toBeNull();
    expect(table?.querySelectorAll(":scope > .shop-panel")).toHaveLength(2);
  });

  it("can collapse and reopen the event log", async () => {
    const user = userEvent.setup();
    saveGameState({ logs: ["Сыграно влияние: Реклама напитков (Вы)."] });
    const { container } = render(<App />);

    expect(container.querySelector(".event-log")).not.toBeNull();
    expect(screen.getByText(/Сыграно влияние/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Свернуть лог/i }));

    expect(container.querySelector(".event-panel")?.classList.contains("log-collapsed")).toBe(true);
    expect(screen.queryByText(/Сыграно влияние/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Показать лог/i }));

    expect(screen.getByText(/Сыграно влияние/i)).toBeInTheDocument();
  });

  it("keeps the planning sales forecast compact by default", () => {
    saveGameState({
      currentCustomers: [CUSTOMER_CARDS.find((customer) => customer.id === "family")!],
      players: [
        { ...testPlayer("A"), shelf: [productInstance(PRODUCT_CARDS.find((product) => product.id === "toy")!, "forecast"), null, null] },
        testPlayer("B")
      ],
      activeTrends: []
    }, null, { language: "en" });
    const { container } = render(<App />);
    const forecastPanel = container.querySelector(".event-panel.forecast-mode");
    const firstToggle = forecastPanel?.querySelector(".sale-result-toggle");

    expect(forecastPanel).not.toBeNull();
    expect(firstToggle).not.toBeNull();
    expect(firstToggle).toHaveAttribute("aria-expanded", "false");
  });

  it("keeps multiple forecast formulas expanded independently", () => {
    saveGameState({
      currentCustomers: [
        CUSTOMER_CARDS.find((customer) => customer.id === "family")!,
        CUSTOMER_CARDS.find((customer) => customer.id === "office_worker")!
      ],
      players: [
        {
          ...testPlayer("A"),
          shelf: [
            productInstance(PRODUCT_CARDS.find((product) => product.id === "toy")!, "forecast-toy"),
            productInstance(PRODUCT_CARDS.find((product) => product.id === "coffee")!, "forecast-coffee"),
            null
          ]
        },
        testPlayer("B")
      ],
      activeTrends: []
    }, null, { language: "en" });
    const { container } = render(<App />);
    const toggles = Array.from(container.querySelectorAll<HTMLButtonElement>(".event-panel.forecast-mode .sale-result-toggle"));

    expect(toggles.length).toBeGreaterThanOrEqual(2);
    fireEvent.click(toggles[0]);
    fireEvent.click(toggles[1]);

    expect(toggles[0]).toHaveAttribute("aria-expanded", "true");
    expect(toggles[1]).toHaveAttribute("aria-expanded", "true");
    expect(container.querySelectorAll(".event-panel.forecast-mode .sale-result-card.expanded")).toHaveLength(2);
  });

  it("keeps the previous round formulas available after auto-continuing sales", async () => {
    const user = userEvent.setup();
    saveGameState({}, null, { language: "en" });
    const { container } = render(<App />);

    await user.click(screen.getByRole("button", { name: /ready/i }));
    await user.click(screen.getByRole("button", { name: /ready/i }));

    expect(container.querySelector(".app-shell")?.classList.contains("phase-sale_resolution")).toBe(false);
    expect(screen.queryByRole("button", { name: /continue/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /previous sales/i })).toHaveAttribute("aria-expanded", "false");
  });

  it("renders card copy areas that can constrain labels inside cards", async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    await user.click(screen.getByRole("button", { name: /2 игрока/i }));

    expect(screen.getByText(/Главный тренд/i)).toBeInTheDocument();
    expect(container.querySelector(".trend-card.focus-trend")).not.toBeNull();
    expect(container.querySelector(".trend-card .trend-copy")).not.toBeNull();
    expect(container.querySelector(".customer-card .customer-copy")).not.toBeNull();
    expect(container.querySelector(".product-card .product-copy")).not.toBeNull();
    expect(container.querySelector(".influence-card .influence-copy")).not.toBeNull();
  });

  it("hides customer personality effects in the standard game by default", () => {
    const student = CUSTOMER_CARDS.find((customer) => customer.id === "student")!;
    saveGameState({
      currentCustomers: [student],
      customerDeck: [],
      activeTrends: []
    }, null, { language: "en" });

    const { container } = render(<App />);

    expect(container.querySelectorAll(".personality-badge")).toHaveLength(0);
  });

  it("explains customer personality rules with direct mechanical copy for the DLC", () => {
    const student = CUSTOMER_CARDS.find((customer) => customer.id === "student")!;
    const blogger = CUSTOMER_CARDS.find((customer) => customer.id === "blogger")!;
    const child = CUSTOMER_CARDS.find((customer) => customer.id === "child")!;

    expect(customerPersonalityDescription("en", student)).toBe("+1 appeal for products tagged budget or priced 2 coins or less.");
    expect(customerPersonalityDescription("en", blogger)).toBe("Only buys products with positive trend bonuses totaling 3 or more. Wishes and influence do not count.");
    expect(customerPersonalityDescription("en", child)).toBe("May choose the second-highest scoring product when it is behind the best by 1 or less.");
  });

  it("does not show personality requirements in the standard sales calculation", async () => {
    const user = userEvent.setup();
    const officeWorker = CUSTOMER_CARDS.find((customer) => customer.id === "office_worker")!;
    const coffee = productInstance(PRODUCT_CARDS.find((product) => product.id === "coffee")!, "office");
    saveGameState({
      currentCustomers: [officeWorker],
      activeTrends: [],
      playedInfluences: [{ id: "drink_ads", name: "Drink Ads", ownerId: "A", modifiers: [{ tag: "РЅР°РїРёС‚РѕРє", value: 1 }] }],
      players: [{ ...testPlayer("A"), shelf: [coffee, null, null] }, testPlayer("B")]
    }, null, { language: "en" });

    const { container } = render(<App />);
    const toggle = container.querySelector<HTMLButtonElement>(".sale-result-toggle");
    expect(toggle).not.toBeNull();

    await user.click(toggle as HTMLButtonElement);

    expect(screen.queryByText(/trend bonus 0 \/ 2/i)).not.toBeInTheDocument();
    expect(container.querySelector(".formula-requirement")).toBeNull();
  });

  it("uses responsive customer atlas assets instead of the oversized source atlas", () => {
    const { container } = render(<App />);
    const sprite = container.querySelector<HTMLElement>(".customer-sprite");
    const atlas = sprite?.style.getPropertyValue("--sprite-atlas");

    expect(atlas).toContain("customer-atlas-128.webp");
    expect(atlas).toContain("customer-atlas-256.webp");
  });

  it("uses the compressed WebP product atlas for product sprites", () => {
    saveGameState({});
    const { container } = render(<App />);
    const sprite = container.querySelector<HTMLElement>(".product-sprite");
    const atlas = sprite?.style.getPropertyValue("--sprite-atlas");

    expect(atlas).toContain("product-atlas.webp");
  });

  it("preloads customer and product card atlases when the app opens", () => {
    render(<App />);

    expectImagePreloaded("customer-atlas-128.webp");
    expectImagePreloaded("customer-atlas-256.webp");
    expectImagePreloaded("product-atlas.webp");
  });

  it("presents menu actions in clear play and online sections", () => {
    const { container } = render(<App />);
    const menuButtons = within(container.querySelector(".menu-primary-grid") as HTMLElement).getAllByRole("button");

    expect(screen.getByText(/выберите режим/i)).toBeInTheDocument();
    expect(screen.getByText(/игра по сети/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ярмарка мира Ааах/i })).toBeInTheDocument();
    expect(menuButtons.map((button) => button.textContent?.trim())).toEqual(["Ярмарка мира Ааах", "2 игрока", "Против ИИ", "Обучение с ИИ"]);
    expect(screen.queryByRole("button", { name: /^Уровни$/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /против ии/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /обучение/i })).toBeInTheDocument();
    expect(container.querySelector(".menu-network-divider")).not.toBeNull();
    expect(container.querySelector(".menu-secondary-actions")).toBeNull();
    expect(container.querySelector(".menu-footer-actions")).not.toBeNull();
    expect(container.querySelector(".menu-support-actions")).not.toBeNull();
    expect(screen.getByRole("button", { name: /Об игре/i })).toBeInTheDocument();
  });

  it("shows the local network address returned by the lobby server", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input) === "/api/network") {
          return new Response(JSON.stringify({ urls: ["http://192.168.1.24:5175"] }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          });
        }

        return new Response("{}", { status: 404 });
      })
    );

    render(<App />);

    expect(await screen.findByRole("link", { name: "http://192.168.1.24:5175" })).toHaveAttribute("href", "http://192.168.1.24:5175");
    expect(screen.getByText(/адрес для игроков/i)).toBeInTheDocument();
  });

  it("chooses AI opponent difficulty before starting a versus AI game", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: /Против ИИ/i }));

    const dialog = screen.getByRole("dialog", { name: /Сложность ИИ/i });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getAllByRole("button").filter((button) => button.classList.contains("primary-action")).map((button) => button.textContent?.trim())).toEqual([
      "Картошка",
      "Купи слона",
      "Зазывала",
      "Волк с Уолл-стрит",
      "Бизнес-Енот"
    ]);

    await user.click(within(dialog).getByRole("button", { name: /Зазывала/i }));

    expect(screen.queryByRole("dialog", { name: /Сложность ИИ/i })).not.toBeInTheDocument();
    expect(screen.getByText(/ИИ: Оппонент/i)).toBeInTheDocument();
    expect(screen.getByText(/Сложность: Зазывала/i)).toBeInTheDocument();
  });

  it("opens the about dialog and renders external support links", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: /Об игре/i }));

    expect(screen.getByRole("dialog", { name: /Об игре/i })).toBeInTheDocument();
    expect(screen.getByText(/личное развлечение/i)).toBeInTheDocument();
    expect(screen.getByText(/zloydeveloper\.info@gmail\.com/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /KristopherZlo\/Awww-Fair/i })).toHaveAttribute("href", "https://github.com/KristopherZlo/Awww-Fair");

    await user.click(screen.getByRole("button", { name: /Закрыть/i }));

    const coffee = screen.getByRole("link", { name: /Buy Me a Coffee/i });
    const paypal = screen.getByRole("link", { name: /PayPal/i });
    expect(coffee).toHaveAttribute("href", "https://buymeacoffee.com/zl0yxp");
    expect(paypal).toHaveAttribute("href", "https://www.paypal.com/donate/?hosted_button_id=CY7A2U64JWY4W");
    expect(coffee).toHaveAttribute("target", "_blank");
    expect(paypal).toHaveAttribute("target", "_blank");
  });

  it("opens the level map and starts level one through a skippable full-screen cutscene", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: /Ярмарка мира Ааах/i }));

    expect(screen.getByText(/Ярмарка мира Ааах/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Уровень 1$/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /^Уровень 2$/i })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /^Уровень 1$/i }));

    const cutscene = screen.getByRole("dialog", { name: /Вступительная катсцена/i });
    expect(cutscene).toBeInTheDocument();
    expect(cutscene).toHaveClass("cutscene-overlay");
    expect(screen.getByText(/В мире Ааах начинается большая ярмарка/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Пропустить/i }));

    expect(screen.getByText(/Уровень 1 \/ 24/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Биби \(Bibi\)/i).length).toBeGreaterThan(0);
  });

  it("preloads the first cutscene card when the locked story map opens", async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    await user.click(buttonFromSelector(container, ".menu-primary-grid .primary-action"));

    expect(buttonFromSelector(container, ".level-node:nth-child(1)")).toBeEnabled();
    expect(buttonFromSelector(container, ".level-node:nth-child(2)")).toBeDisabled();
    expectImagePreloaded("cutscene/aaakh-01.webp");
  });

  it("preloads the next cutscene card while the current one is shown", async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    await user.click(buttonFromSelector(container, ".menu-primary-grid .primary-action"));
    await user.click(buttonFromSelector(container, ".level-node:nth-child(1)"));

    expectImagePreloaded("cutscene/aaakh-02.webp");

    await user.click(buttonFromSelector(container, ".cutscene-subtitles .primary-action"));

    expectImagePreloaded("cutscene/aaakh-03.webp");
  });

  it("starts the first campaign level without trends, goals, or influence cards", async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    await user.click(screen.getByRole("button", { name: /Ярмарка мира Ааах/i }));
    await user.click(screen.getByRole("button", { name: /^Уровень 1$/i }));
    await user.click(screen.getByRole("button", { name: /Пропустить/i }));

    expect(container.querySelectorAll(".trend-strip .trend-card")).toHaveLength(0);
    expect(container.querySelectorAll(".party-goal")).toHaveLength(0);
    expect(container.querySelectorAll(".personality-badge")).toHaveLength(0);
    expect(screen.queryByRole("heading", { name: /^Влияние$/i })).not.toBeInTheDocument();
  });

  it("plays the cutscene music during the campaign intro and returns to game music after skipping", async () => {
    vi.useFakeTimers();
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /Ярмарка мира Ааах/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Уровень 1$/i }));
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(mockAudioInstances[0].src).toContain("cutscene.mp3");

    fireEvent.click(screen.getByRole("button", { name: /Пропустить/i }));
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(mockAudioInstances[0].src).toContain("stroll.mp3");
  });

  it("records a campaign win and unlocks the next level", async () => {
    saveGameState({
      phase: "game_end",
      aiPlayerId: "B",
      aiMode: "opponent",
      campaignRun: {
        level: 1,
        aiDifficulty: 1,
        opponentName: "Биби",
        opponentNameEn: "Bibi",
        unlockRecorded: false
      },
      players: [
        { ...testPlayer("A"), money: 8 },
        { ...testPlayer("B"), name: "Биби (Bibi)", money: 2 }
      ]
    });

    render(<App />);

    await waitFor(() => {
      expect(window.localStorage.getItem("trend-market-campaign-v1")).toContain('"highestUnlockedLevel":2');
    });
  });

  it("records a campaign draw as level progress", async () => {
    saveGameState({
      phase: "game_end",
      aiPlayerId: "B",
      aiMode: "opponent",
      campaignRun: {
        level: 1,
        aiDifficulty: 1,
        opponentName: "Биби",
        opponentNameEn: "Bibi",
        unlockRecorded: false
      },
      players: [
        { ...testPlayer("A"), money: 8, sales: 2 },
        { ...testPlayer("B"), name: "Биби (Bibi)", money: 8, sales: 2 }
      ]
    });

    render(<App />);

    await waitFor(() => {
      expect(window.localStorage.getItem("trend-market-campaign-v1")).toContain('"highestUnlockedLevel":2');
    });
  });

  it("does not unlock the next campaign level after a loss", async () => {
    saveGameState({
      phase: "game_end",
      aiPlayerId: "B",
      aiMode: "opponent",
      campaignRun: {
        level: 1,
        aiDifficulty: 1,
        opponentName: "Биби",
        opponentNameEn: "Bibi",
        unlockRecorded: false
      },
      players: [
        { ...testPlayer("A"), money: 2 },
        { ...testPlayer("B"), name: "Биби (Bibi)", money: 8 }
      ]
    });

    render(<App />);

    await waitFor(() => {
      expect(window.localStorage.getItem("trend-market-campaign-v1")).toBeNull();
    });
  });

  it("offers the next campaign level after a win and repeats the level after a loss", () => {
    saveGameState({
      phase: "game_end",
      aiPlayerId: "B",
      aiMode: "opponent",
      campaignRun: {
        level: 1,
        aiDifficulty: 1,
        opponentName: "Биби",
        opponentNameEn: "Bibi",
        unlockRecorded: true
      },
      players: [
        { ...testPlayer("A"), money: 8 },
        { ...testPlayer("B"), name: "Биби (Bibi)", money: 2 }
      ]
    });

    const winScreen = render(<App />);
    expect(screen.getByRole("button", { name: /Следующий уровень/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Сыграть ещё/i })).not.toBeInTheDocument();

    winScreen.unmount();
    window.localStorage.clear();
    saveGameState({
      phase: "game_end",
      aiPlayerId: "B",
      aiMode: "opponent",
      campaignRun: {
        level: 1,
        aiDifficulty: 1,
        opponentName: "Биби",
        opponentNameEn: "Bibi",
        unlockRecorded: true
      },
      players: [
        { ...testPlayer("A"), money: 2 },
        { ...testPlayer("B"), name: "Биби (Bibi)", money: 8 }
      ]
    });

    render(<App />);
    expect(screen.getByRole("button", { name: /Повторить уровень/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Следующий уровень/i })).not.toBeInTheDocument();
  });

  it("opens audio settings with separate music and effects controls", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getAllByRole("button", { name: /настройки/i })[0]);

    expect(screen.getByRole("dialog", { name: /настройки/i })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /фоновая музыка/i })).toBeChecked();
    expect(screen.getByRole("slider", { name: /громкость музыки/i })).toHaveValue("0.3");
    expect(screen.getByRole("checkbox", { name: /звуковые эффекты/i })).toBeChecked();
    expect(screen.getByRole("slider", { name: /громкость эффектов/i })).toHaveValue("1");
    expect(screen.getByRole("slider", { name: /время хода/i })).toHaveValue("45");
    expect(screen.getByText(/сейчас играет: Main Menu/i)).toBeInTheDocument();
  });

  it("switches the interface language in settings and persists the choice", async () => {
    const user = userEvent.setup();
    const firstRender = render(<App />);

    await user.click(screen.getAllByRole("button", { name: /настройки/i })[0]);
    await user.selectOptions(screen.getByRole("combobox", { name: /язык/i }), "en");

    expect(screen.getByRole("heading", { name: /Settings/i })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /Language/i })).toHaveValue("en");

    await user.click(screen.getByRole("button", { name: /Close settings/i }));
    expect(screen.getByRole("heading", { name: /Choose mode/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Versus AI/i })).toBeInTheDocument();

    firstRender.unmount();
    render(<App />);

    expect(screen.getByRole("heading", { name: /Choose mode/i })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /Выберите режим/i })).not.toBeInTheDocument();
  });

  it("renders saved game cards, tags, and goals in English", () => {
    const toy = productInstance(PRODUCT_CARDS.find((product) => product.id === "toy")!, "sale-a");
    saveGameState(
      {
        players: [{ ...testPlayer("A"), shelf: [toy, null, null] }, testPlayer("B")],
        activeTrends: [
          TREND_CARDS.find((trend) => trend.id === "kids_day")!,
          TREND_CARDS.find((trend) => trend.id === "coffee_morning")!,
          TREND_CARDS.find((trend) => trend.id === "sweet_day")!
        ],
        currentCustomers: [CUSTOMER_CARDS.find((customer) => customer.id === "family")!],
        partyGoals: [
          {
            id: "tag-sales-детское",
            title: "Продайте 2 товара с тегом «детское»",
            kind: "tag_sales",
            target: 2,
            progress: 1,
            completed: false,
            reward: 2,
            rewardClaimed: false,
            completedBy: null,
            tag: "детское"
          }
        ]
      },
      null,
      { language: "en" }
    );

    render(<App />);

    expect(screen.getByRole("heading", { name: /Your stall/i })).toBeInTheDocument();
    expect(screen.getByText("Toy")).toBeInTheDocument();
    expect(screen.getAllByText("kids").length).toBeGreaterThan(0);
    expect(screen.getByText(/Sell 2 products tagged "kids"/i)).toBeInTheDocument();
  });

  it("uses menu music before the game and fades into Stroll when play starts", async () => {
    vi.useFakeTimers();
    render(<App />);

    expect(mockAudioInstances[0].src).toContain("main-menu.mp3");

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /2 игрока/i }));
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(mockAudioInstances[0].src).toContain("stroll.mp3");
    expect(mockAudioInstances[0].currentTime).toBe(0);
  });

  it("restarts menu music if the browser reports that the menu track ended", () => {
    render(<App />);
    const shell = document.querySelector(".app-shell");

    expect(shell).not.toBeNull();
    fireEvent.pointerDown(shell!);
    expect(mockAudioInstances[0].play).toHaveBeenCalledTimes(1);

    mockAudioInstances[0].currentTime = 12;
    act(() => {
      mockAudioInstances[0].emit("ended");
    });

    expect(mockAudioInstances[0].src).toContain("main-menu.mp3");
    expect(mockAudioInstances[0].currentTime).toBe(0);
    expect(mockAudioInstances[0].play).toHaveBeenCalledTimes(2);
    expect(mockAudioInstances[0].loop).toBe(true);
  });

  it("keeps a manually selected game track across phase changes and advances after it ends", async () => {
    vi.useFakeTimers();
    render(<App />);

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /2 игрока/i }));
      vi.advanceTimersByTime(1000);
    });
    expect(mockAudioInstances[0].src).toContain("stroll.mp3");

    fireEvent.click(screen.getByRole("button", { name: /Пауза/i }));
    fireEvent.click(screen.getByRole("button", { name: /Настройки/i }));
    fireEvent.click(screen.getByRole("button", { name: /Следующий трек/i }));
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(mockAudioInstances[0].src).toContain("loficomfy.mp3");

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /Закрыть настройки/i }));
      fireEvent.click(screen.getByRole("button", { name: /Продолжить/i }));
      fireEvent.click(screen.getByRole("button", { name: /Готов/i }));
      fireEvent.click(screen.getByRole("button", { name: /Готов/i }));
      vi.advanceTimersByTime(1000);
    });

    expect(mockAudioInstances[0].src).toContain("loficomfy.mp3");

    act(() => {
      mockAudioInstances[0].emit("ended");
    });

    expect(mockAudioInstances[0].src).toContain("lofidoofy.mp3");
  });

  it("shows a ticking timer during the local planning turn", async () => {
    vi.useFakeTimers();
    render(<App />);

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /2 игрока/i }));
    });

    expect(screen.getByText(/Ход: 00:45/i)).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getByText(/Ход: 00:44/i)).toBeInTheDocument();
  });

  it("shows a short animated cue when control passes to the local turn", async () => {
    vi.useFakeTimers();
    const { container } = render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /2 игрока/i }));

    const cue = container.querySelector(".turn-cue-backdrop");
    expect(cue).not.toBeNull();
    expect(cue).toHaveTextContent(/Ход игрока [AB]/i);

    act(() => {
      vi.advanceTimersByTime(1400);
    });

    expect(container.querySelector(".turn-cue-backdrop")).toBeNull();
  });

  it("clears the turn cue when its animation ends", async () => {
    vi.useFakeTimers();
    const { container } = render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /2 игрока/i }));

    const cue = container.querySelector(".turn-cue-backdrop");
    expect(cue).not.toBeNull();

    fireEvent.animationEnd(cue as Element);

    expect(container.querySelector(".turn-cue-backdrop")).toBeNull();
  });

  it("clears the turn cue even when the turn-start sound fails", async () => {
    vi.useFakeTimers();
    saveGameState({ activePlayer: "A", aiPlayerId: "B" });
    Object.defineProperty(window, "AudioContext", {
      configurable: true,
      value: class {
        constructor() {
          throw new Error("AudioContext unavailable");
        }
      }
    });

    const { container } = render(<App />);

    expect(container.querySelector(".turn-cue-backdrop")).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(1400);
    });

    expect(container.querySelector(".turn-cue-backdrop")).toBeNull();
  });

  it("uses the configured turn time for new local games", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getAllByRole("button", { name: /Настройки/i })[0]);
    fireEvent.change(screen.getByRole("slider", { name: /время хода/i }), { target: { value: "30" } });
    await user.click(screen.getByRole("button", { name: /Закрыть настройки/i }));
    await user.click(screen.getByRole("button", { name: /2 игрока/i }));

    expect(screen.getByText(/Ход: 00:30/i)).toBeInTheDocument();
  });

  it("sends the lobby host turn time when creating an online table", async () => {
    const user = userEvent.setup();
    let postedState: Record<string, unknown> | null = null;
    let postedTurnTime: unknown;
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (String(_input) === "/api/network") {
        return new Response(JSON.stringify({ urls: ["http://192.168.1.24:5175"] }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      if (String(_input).includes("/leave")) {
        return new Response(
          JSON.stringify({
            code: "ABCD2",
            version: 2,
            state: postedState,
            seats: { A: false, B: false }
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      if (init?.method !== "POST") {
        return new Response(
          JSON.stringify({
            code: "ABCD2",
            playerId: "A",
            token: "host-token",
            version: 1,
            state: postedState,
            seats: { A: true, B: false }
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      const body = JSON.parse(String(init.body)) as { state: Record<string, unknown> };
      postedState = body.state;
      postedTurnTime = body.state.turnTimeSeconds;
      return new Response(
        JSON.stringify({
          code: "ABCD2",
          playerId: "A",
          token: "host-token",
          version: 1,
          state: body.state,
          seats: { A: true, B: false }
        }),
        { status: 201, headers: { "Content-Type": "application/json" } }
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);

    await user.click(screen.getAllByRole("button", { name: /Настройки/i })[0]);
    fireEvent.change(screen.getByRole("slider", { name: /время хода/i }), { target: { value: "30" } });
    await user.click(screen.getByRole("button", { name: /Закрыть настройки/i }));
    await user.click(screen.getByRole("button", { name: /Создать стол/i }));

    await waitFor(() => expect(postedTurnTime).toBe(30));
    expect(await screen.findByRole("dialog", { name: /Ожидание второго игрока/i })).toBeInTheDocument();
    expect(screen.getByText("ABCD2")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Выйти$/i }));

    expect(screen.getByRole("button", { name: /2 игрока/i })).toBeInTheDocument();
  });

  it("does not reopen the lobby code waiting dialog when both lobby seats are still occupied", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
    saveGameState(
      { phase: "menu" },
      {
        code: "ABCD2",
        playerId: "A",
        token: "host-token",
        version: 3,
        seats: { A: true, B: true }
      }
    );

    render(<App />);

    expect(screen.queryByRole("dialog", { name: /Ожидание второго игрока/i })).not.toBeInTheDocument();
    expect(screen.queryByText("ABCD2")).not.toBeInTheDocument();
  });

  it("does not show a locked choice modal while the online opponent is choosing a drawn card", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
    saveGameState(
      {
        activePlayer: "B",
        choiceDraft: {
          playerId: "B",
          type: "influence",
          cards: INFLUENCE_CARDS.slice(0, 2)
        }
      },
      {
        code: "ABCD2",
        playerId: "A",
        token: "host-token",
        version: 3,
        seats: { A: true, B: true }
      }
    );

    render(<App />);

    expect(screen.queryByText(/Оставьте одну карту/i)).not.toBeInTheDocument();
  });

  it("renders shared lobby log player tokens from the local viewer perspective", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
    saveGameState(
      {
        logs: ["Сыграно влияние: Реклама напитков ({{player:B}})."]
      },
      {
        code: "ABCD2",
        playerId: "A",
        token: "host-token",
        version: 3,
        seats: { A: true, B: true }
      }
    );

    render(<App />);

    expect(screen.getByText(/Сыграно влияние: Реклама напитков \(Оппонент\)\./i)).toBeInTheDocument();
    expect(screen.queryByText(/\{\{player:B\}\}/)).not.toBeInTheDocument();
  });

  it("plays one money sound when the current hotseat player earns from a sale", async () => {
    const user = userEvent.setup();
    const toy = productInstance(PRODUCT_CARDS.find((product) => product.id === "toy")!, "sale-a");
    const coffee = productInstance(PRODUCT_CARDS.find((product) => product.id === "coffee")!, "sale-b");
    const playerA = { ...testPlayer("A"), planned: true, shelf: [toy, null, null] };
    const playerB = { ...testPlayer("B"), shelf: [coffee, null, null] };
    saveGameState({
      activePlayer: "B",
      players: [playerA, playerB],
      currentCustomers: [
        CUSTOMER_CARDS.find((customer) => customer.id === "family")!,
        CUSTOMER_CARDS.find((customer) => customer.id === "office_worker")!
      ],
      activeTrends: [
        TREND_CARDS.find((trend) => trend.id === "kids_day")!,
        TREND_CARDS.find((trend) => trend.id === "coffee_morning")!,
        TREND_CARDS.find((trend) => trend.id === "sweet_day")!
      ]
    });

    render(<App />);
    await user.click(screen.getByRole("button", { name: /Готов/i }));

    expect(document.querySelector(".app-shell.phase-sale_resolution")).toBeNull();
    expect(screen.getByRole("button", { name: /Итоги прошлого раунда/i })).toBeInTheDocument();
    expect(mockAudioInstances.filter((audio) => /money\.wav/.test(audio.src))).toHaveLength(1);
  });

  it("does not play the sale money sound when only the hotseat opponent earns", async () => {
    const user = userEvent.setup();
    const toy = productInstance(PRODUCT_CARDS.find((product) => product.id === "toy")!, "sale-a");
    const playerA = { ...testPlayer("A"), planned: true, shelf: [toy, null, null] };
    const playerB = { ...testPlayer("B"), shelf: [null, null, null] };
    saveGameState({
      activePlayer: "B",
      players: [playerA, playerB],
      currentCustomers: [CUSTOMER_CARDS.find((customer) => customer.id === "family")!],
      activeTrends: [
        TREND_CARDS.find((trend) => trend.id === "kids_day")!,
        TREND_CARDS.find((trend) => trend.id === "coffee_morning")!,
        TREND_CARDS.find((trend) => trend.id === "sweet_day")!
      ]
    });

    render(<App />);
    await user.click(screen.getByRole("button", { name: /Готов/i }));

    expect(document.querySelector(".app-shell.phase-sale_resolution")).toBeNull();
    expect(screen.getByRole("button", { name: /Итоги прошлого раунда/i })).toBeInTheDocument();
    expect(mockAudioInstances.filter((audio) => /money\.wav/.test(audio.src))).toHaveLength(0);
  });

  it("plays the money sound when a remote lobby update gives the local player coins", async () => {
    saveGameState(
      {},
      {
        code: "ABCD2",
        playerId: "A",
        token: "host-token",
        version: 1,
        seats: { A: true, B: true }
      }
    );
    const saved = JSON.parse(window.localStorage.getItem("trend-market-session-v1") ?? "{}") as { state: Record<string, unknown> };
    const remoteState = {
      ...saved.state,
      players: (saved.state.players as PlayerState[]).map((player) => (player.id === "A" ? { ...player, money: player.money + 3 } : player))
    };

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input) === "/api/network") {
          return new Response(JSON.stringify({ urls: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
        }

        return new Response(
          JSON.stringify({
            code: "ABCD2",
            version: 2,
            state: remoteState,
            seats: { A: true, B: true }
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      })
    );

    render(<App />);

    await waitFor(() => {
      expect(mockAudioInstances.filter((audio) => /money\.wav/.test(audio.src))).toHaveLength(1);
    });
  });

  it("calculates a random zero-to-five second delay for AI turns", () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.5);

    try {
      expect(randomAiTurnDelayMs()).toBe(2500);

      randomSpy.mockReturnValue(0);
      expect(randomAiTurnDelayMs()).toBe(0);

      randomSpy.mockReturnValue(0.999999);
      expect(randomAiTurnDelayMs()).toBeLessThanOrEqual(5000);
      expect(randomAiTurnDelayMs()).toBeGreaterThanOrEqual(0);
    } finally {
      randomSpy.mockRestore();
    }
  });

  it("ducks settings music to half volume and restores it smoothly", () => {
    vi.useFakeTimers();
    render(<App />);

    expect(mockAudioInstances[0].volume).toBeCloseTo(0.3);

    fireEvent.click(screen.getAllByRole("button", { name: /Настройки/i })[0]);
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(mockAudioInstances[0].volume).toBeCloseTo(0.15);

    fireEvent.click(screen.getByRole("button", { name: /Закрыть настройки/i }));
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(mockAudioInstances[0].volume).toBeCloseTo(0.3);
  });

  it("does not render the opponent-benefit warning copy", () => {
    render(<App />);

    expect(screen.queryByText(/Внимание: эффект выгоднее сопернику/i)).not.toBeInTheDocument();
  });

  it("shows short sales insight feedback in the previous round review", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: /2 игрока/i }));
    await user.click(screen.getByRole("button", { name: /Готов/i }));
    await user.click(screen.getByRole("button", { name: /Готов/i }));

    await user.click(screen.getByRole("button", { name: /Итоги прошлого раунда/i }));

    expect(screen.getByText(/Коротко о продажах/i)).toBeInTheDocument();
    expect(screen.getAllByText(/выбрал|ничего не купил|выбрала/i).length).toBeGreaterThan(0);
  });

  it("shows feedback when a shelf slot cannot accept a product", async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    await user.click(screen.getByRole("button", { name: /2 игрока/i }));
    const unavailableSlot = screen.getAllByRole("button", { name: /слот товара/i })[0];

    expect(unavailableSlot).toHaveAttribute("aria-disabled", "true");

    await user.click(unavailableSlot);

    expect(container.querySelector(".shelf-slot.slot-rejecting")).not.toBeNull();
  });

  it("starts an AI training game and lets the AI score its planning turn", async () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: /обучение/i }));
    await user.click(screen.getByRole("button", { name: /Готов/i }));

    await waitFor(
      () => {
        expect(screen.getByText(/ИИ: Оппонент/i)).toBeInTheDocument();
        const aiScore = document.querySelector(".ai-score") as HTMLElement | null;
        expect(aiScore).not.toBeNull();
        expect(within(aiScore as HTMLElement).getByText(/оценка хода/i)).toBeInTheDocument();
      },
      { timeout: 2500 }
    );
    randomSpy.mockRestore();
  });

  it("places the AI score beside sync status and keeps pause as the rightmost top-bar control", async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    await user.click(screen.getByRole("button", { name: /обучение/i }));

    const topBar = container.querySelector(".top-bar");
    const topActions = container.querySelector(".top-actions");

    expect(topActions?.children[0]).toHaveClass("sync-pill");
    expect(topActions?.children[1]).toHaveClass("ai-score");
    expect(topBar?.lastElementChild).toHaveClass("settings-toggle");
  });

  it("starts a normal AI opponent game without training coach advice", async () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: /против ии/i }));
    await user.click(screen.getByRole("button", { name: /Зазывала/i }));

    expect(screen.getByText(/ИИ: Оппонент/i)).toBeInTheDocument();
    expect(screen.queryByText(/совет тренера/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Готов/i }));

    await waitFor(
      () => {
        expect(screen.getAllByText(/Оппонент (делает ставку|выставил|сыграл|копит|купил)/i).length).toBeGreaterThan(0);
      },
      { timeout: 2500 }
    );
    randomSpy.mockRestore();
  });

  it("lets the AI activate ad table before passing planning back", async () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    const aiPlayer = testPlayer("B");
    aiPlayer.shelf = [productInstance(PRODUCT_CARDS.find((product) => product.id === "cake")!, "cake-table"), null, null];
    aiPlayer.productHand = [];
    aiPlayer.influenceHand = [];
    aiPlayer.upgrades = [UPGRADE_CARDS.find((upgrade) => upgrade.id === "ad_table")!];
    saveGameState({
      phase: "planning",
      activePlayer: "B",
      aiPlayerId: "B",
      players: [testPlayer("A"), aiPlayer],
      currentCustomers: [CUSTOMER_CARDS.find((customer) => customer.id === "child")!],
      activeTrends: [TREND_CARDS.find((trend) => trend.id === "sweet_day")!],
      playedInfluences: [],
      roundBonuses: [],
      logs: []
    });

    render(<App />);

    await waitFor(
      () => {
        expect(screen.getByText(/Рекламный столик усилил товар/i)).toBeInTheDocument();
      },
      { timeout: 2500 }
    );
    randomSpy.mockRestore();
  });

  it("renders a dedicated game-end screen with exit and replay actions plus a result jingle", async () => {
    const user = userEvent.setup();
    render(<App />);

    await playUntilGameEnd(user);

    expect(screen.getByRole("button", { name: /Выйти/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Сыграть ещё/i })).toBeInTheDocument();
    expect(screen.queryByText(/Итог: игрок A/i)).not.toBeInTheDocument();
    expect(mockAudioInstances.some((audio) => /victory\.wav|defeat\.wav/.test(audio.src))).toBe(true);
  });

  it("shows coach advice and highlights recommended choices in AI training mode", async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    await user.click(screen.getByRole("button", { name: /обучение/i }));

    expect(screen.getByText(/совет тренера/i)).toBeInTheDocument();
    expect(screen.getAllByText(/лучше/i).length).toBeGreaterThan(0);
    await waitFor(() => expect(container.querySelector(".coach-recommended")).not.toBeNull(), { timeout: 2500 });
  });

  it("exposes hidden correct-move markers for local planning recommendations without coach UI", () => {
    const localPlayer = testPlayer("A");
    localPlayer.productHand = [
      productInstance(PRODUCT_CARDS.find((product) => product.id === "bread")!, "bread-helper"),
      productInstance(PRODUCT_CARDS.find((product) => product.id === "cake")!, "cake-helper")
    ];
    localPlayer.influenceHand = [INFLUENCE_CARDS.find((card) => card.id === "sweet_smell")!];

    saveGameState({
      activePlayer: "A",
      aiPlayerId: "B",
      aiMode: "opponent",
      players: [localPlayer, testPlayer("B")],
      currentCustomers: [CUSTOMER_CARDS.find((customer) => customer.id === "child")!],
      activeTrends: [TREND_CARDS.find((trend) => trend.id === "sweet_day")!]
    });

    const { container } = render(<App />);

    expect(container.querySelector(".coach-panel")).toBeNull();
    expect(container.querySelector(".coach-recommended")).toBeNull();

    const correctProduct = container.querySelector('[data-correct-product-id="cake-cake-helper"][data-correct-move="true"]');
    expect(correctProduct).not.toBeNull();
    expect(container.querySelector('[data-correct-influence-id="sweet_smell"][data-correct-move="true"]')).not.toBeNull();

    fireEvent.click(correctProduct as Element);

    expect(container.querySelector('[data-correct-owner-id="A"][data-correct-slot-index="0"][data-correct-move="true"]')).not.toBeNull();
  });

  it("exposes hidden correct-move markers for upgrade and choice-modal recommendations", () => {
    const buyer = testPlayer("A");
    buyer.money = 9;

    saveGameState({
      phase: "upgrade",
      activePlayer: "A",
      aiPlayerId: "B",
      aiMode: "opponent",
      players: [buyer, testPlayer("B")],
      upgradeOffer: ["regular_customers", "extra_shelf", "bright_sign"].map((id) => UPGRADE_CARDS.find((upgrade) => upgrade.id === id)!),
      upgradeQueue: ["A", "B"]
    });

    const upgradeRender = render(<App />);

    expect(upgradeRender.container.querySelector('[data-correct-upgrade-id="extra_shelf"][data-correct-move="true"]')).not.toBeNull();

    upgradeRender.unmount();
    window.localStorage.clear();

    const localPlayer = testPlayer("A");
    localPlayer.productHand = [];
    saveGameState({
      activePlayer: "A",
      aiPlayerId: "B",
      aiMode: "opponent",
      players: [localPlayer, testPlayer("B")],
      currentCustomers: [CUSTOMER_CARDS.find((customer) => customer.id === "child")!],
      activeTrends: [TREND_CARDS.find((trend) => trend.id === "kids_day")!],
      choiceDraft: {
        playerId: "A",
        type: "product",
        cards: [
          productInstance(PRODUCT_CARDS.find((product) => product.id === "bread")!, "bread-choice"),
          productInstance(PRODUCT_CARDS.find((product) => product.id === "toy")!, "toy-choice")
        ]
      }
    });

    const choiceRender = render(<App />);

    expect(choiceRender.container.querySelector('.choice-modal [data-correct-product-id="toy-toy-choice"][data-correct-move="true"]')).not.toBeNull();
  });

  it("adds a product card for mini storage at the start of the next round", async () => {
    const user = userEvent.setup();
    const buyer = {
      ...testPlayer("A"),
      money: 5,
      productHand: [
        productInstance(PRODUCT_CARDS[0], "hand-1"),
        productInstance(PRODUCT_CARDS[1], "hand-2"),
        productInstance(PRODUCT_CARDS[2], "hand-3"),
        productInstance(PRODUCT_CARDS[3], "hand-4")
      ]
    };

    saveGameState({
      phase: "upgrade",
      round: 2,
      firstPlayer: "B",
      activePlayer: "A",
      players: [buyer, testPlayer("B")],
      productDeck: [productInstance(PRODUCT_CARDS[4], "mini-storage-draw")],
      upgradeOffer: [UPGRADE_CARDS.find((upgrade) => upgrade.id === "mini_storage")!],
      upgradeQueue: ["A"]
    }, null, { language: "en" });
    const { container } = render(<App />);

    await user.click(container.querySelector<HTMLButtonElement>('[data-correct-upgrade-id="mini_storage"]')!);

    expect(container.querySelector(".app-shell")?.classList.contains("phase-planning")).toBe(true);
    expect(container.querySelectorAll(".hand-panel .product-card")).toHaveLength(5);
  });

  it("auto-skips an upgrade choice after twenty seconds", () => {
    vi.useFakeTimers();
    const buyer = testPlayer("A");
    buyer.money = 9;
    saveGameState({
      phase: "upgrade",
      activePlayer: "A",
      players: [buyer, testPlayer("B")],
      upgradeOffer: ["regular_customers", "extra_shelf"].map((id) => UPGRADE_CARDS.find((upgrade) => upgrade.id === id)!),
      upgradeQueue: ["A", "B"]
    }, null, { language: "en" });
    const { container } = render(<App />);

    expect(container.querySelector(".turn-timer")).toHaveTextContent("00:20");

    act(() => {
      vi.advanceTimersByTime(20_000);
    });

    expect(screen.getByText(/B chooses/i)).toBeInTheDocument();
  });

  it("shows a silent countdown during the online opponent planning turn", () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
    saveGameState(
      {
        activePlayer: "B",
        turnTimeSeconds: 15
      },
      {
        code: "ABCD2",
        playerId: "A",
        token: "host-token",
        version: 3,
        seats: { A: true, B: true }
      },
      { language: "en" }
    );
    const { container } = render(<App />);

    expect(container.querySelector(".turn-timer")).toHaveTextContent("Opponent turn: 00:15");

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(container.querySelector(".turn-timer")).toHaveTextContent("Opponent turn: 00:14");
    expect(container.querySelector(".app-shell")?.classList.contains("phase-planning")).toBe(true);
  });

  it("restarts an online lobby game without dropping to a local table", async () => {
    let postedState: Record<string, unknown> | null = null;
    saveGameState(
      {
        phase: "game_end",
        players: [
          { ...testPlayer("A"), money: 8 },
          { ...testPlayer("B"), money: 2 }
        ]
      },
      {
        code: "ABCD2",
        playerId: "A",
        token: "host-token",
        version: 3,
        seats: { A: true, B: true }
      },
      { language: "en" }
    );
    const saved = JSON.parse(window.localStorage.getItem("trend-market-session-v1") ?? "{}") as { state: Record<string, unknown> };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) === "/api/network") {
          return new Response(JSON.stringify({ urls: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
        }
        if (init?.method === "PUT") {
          postedState = JSON.parse(String(init.body)).state;
          return new Response(
            JSON.stringify({ code: "ABCD2", playerId: "A", token: "host-token", version: 4, state: postedState, seats: { A: true, B: true } }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
        return new Response(
          JSON.stringify({ code: "ABCD2", playerId: "A", token: "host-token", version: 3, state: saved.state, seats: { A: true, B: true } }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      })
    );
    const { container } = render(<App />);

    fireEvent.click(container.querySelector<HTMLButtonElement>(".end-actions .primary-action")!);

    await waitFor(() => expect(postedState?.phase).toBe("planning"));
    expect(screen.getByText(/lobby code ABCD2/i)).toBeInTheDocument();
  });
});
