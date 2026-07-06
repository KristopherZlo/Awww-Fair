import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App, { randomAiTurnDelayMs } from "./App";
import { clearImagePreloadCacheForTest } from "./assetPreloader";
import { CUSTOMER_CARDS, INFLUENCE_CARDS, PRODUCT_CARDS, TREND_CARDS, UPGRADE_CARDS } from "./data/cards";
import { customerPersonalityDescription } from "./i18n";
import type { PartyGoal } from "./game/goals";
import { buildInitialState } from "./game/session";
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
    await startHotseatGame(user);

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

  async function startHotseatGame(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("tab", { name: /^2 игрока$/i }));
    await user.click(screen.getByRole("button", { name: /^Играть$/i }));
  }

  async function startTrainingGame(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("tab", { name: /Обучение с ИИ/i }));
    await user.click(screen.getByRole("button", { name: /^Играть$/i }));
  }

  function startHotseatGameWithFireEvent() {
    fireEvent.click(screen.getByRole("tab", { name: /^2 игрока$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Играть$/i }));
  }

  async function openStoryLevelMap(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("tab", { name: /Сюжетный режим/i }));
  }

  function openStoryLevelMapWithFireEvent() {
    fireEvent.click(screen.getByRole("tab", { name: /Сюжетный режим/i }));
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
    expect(screen.queryByText(/Характеры клиентов:/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Почти равный выбор.*товар со вторым результатом/i)).not.toBeInTheDocument();
    expect(screen.getByText(/При продаже ты получаешь цену товара/i)).toBeInTheDocument();
    expect(screen.getByText(/Цели партии дают \+2 монеты/i)).toBeInTheDocument();
    expect(screen.getByText(/В режиме истории часть механик может быть временно отключена/i)).toBeInTheDocument();
    expect(within(rules as HTMLElement).queryByText(/2-й вариант|второй вариант/i)).not.toBeInTheDocument();
  });

  it("labels local player as you and the other seat as opponent", async () => {
    const user = userEvent.setup();
    const hotseatRender = render(<App />);

    await startHotseatGame(user);

    expect(screen.getAllByText("Вы").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Оппонент").length).toBeGreaterThan(0);
    expect(screen.queryByText(/Игрок A|Игрок B/i)).not.toBeInTheDocument();

    hotseatRender.unmount();
    window.localStorage.clear();
    render(<App />);

    await startTrainingGame(user);

    expect(screen.getByText(/ИИ: Оппонент/i)).toBeInTheDocument();
    expect(screen.queryByText(/ИИ игрок B/i)).not.toBeInTheDocument();
  });

  it("switches the shell layout class when the planning phase starts", async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    await startHotseatGame(user);

    expect(container.querySelector(".app-shell")?.classList.contains("phase-planning")).toBe(true);
  });

  it("labels local hotseat turns by player id", async () => {
    const user = userEvent.setup();
    render(<App />);

    await startHotseatGame(user);

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

    await startHotseatGame(user);

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

    await startHotseatGame(user);

    expect(screen.getByText(/прогноз продаж/i)).toBeInTheDocument();
    expect(screen.getByText(/если считать сейчас/i)).toBeInTheDocument();
    expect(screen.getAllByText(/0/).length).toBeGreaterThan(0);
  });

  it("shows three party goals when a game starts", async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    await startHotseatGame(user);

    expect(screen.getByText(/Цели партии/i)).toBeInTheDocument();
    expect(container.querySelectorAll(".party-goal")).toHaveLength(3);
    expect(screen.queryByText(/награда/i)).not.toBeInTheDocument();
  });

  it("hides upcoming customer and trend previews during the last round", () => {
    saveGameState({});
    const { container } = render(<App />);

    expect(container.querySelector(".preview-card")).not.toBeNull();
    expect(container.querySelector(".next-customer")).not.toBeNull();

    window.localStorage.clear();
    saveGameState({ round: 8 });

    const lastRound = render(<App />);

    expect(lastRound.container.querySelector(".preview-card")).toBeNull();
    expect(lastRound.container.querySelector(".next-customer")).toBeNull();
  });

  it("labels trends as a timeline from current to next round", () => {
    saveGameState({}, null, { language: "en" });
    const { container } = render(<App />);
    const labels = Array.from(container.querySelectorAll(".trend-strip .trend-copy em")).map((label) => label.textContent?.trim());

    expect(labels).toContain("Now");
    expect(labels).toContain("Active");
    expect(labels).toContain("Next round");
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

    startHotseatGameWithFireEvent();

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

    await startHotseatGame(user);
    await waitFor(() => expect(window.localStorage.getItem("trend-market-session-v1")).toContain('"phase":"planning"'));

    await user.click(screen.getByRole("button", { name: /Пауза/i }));
    await user.click(screen.getByRole("button", { name: /Выйти в меню/i }));

    expect(screen.getByRole("dialog", { name: /Выйти в меню/i })).toBeInTheDocument();
    expect(screen.getByText(/Вы действительно хотите выйти/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Остаться$/i }));
    expect(screen.getByRole("dialog", { name: /Пауза/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Выйти в меню/i }));
    await user.click(screen.getByRole("button", { name: /^Выйти$/i }));

    expect(screen.getByRole("tab", { name: /^2 игрока$/i })).toBeInTheDocument();
    await waitFor(() => expect(window.localStorage.getItem("trend-market-session-v1")).toBeNull());
  });

  it("keeps in-game settings inside a vertical pause menu", async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    await startHotseatGame(user);

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
    expect(screen.queryByRole("slider", { name: /время хода/i })).not.toBeInTheDocument();
  });

  it("keeps the event panel in the app grid instead of inside the table", () => {
    saveGameState({});
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
    expect(firstToggle).toHaveTextContent("Family");
    expect(firstToggle).toHaveTextContent("Toy");
    expect(firstToggle).toHaveTextContent("3 / 5");
    expect(firstToggle).toHaveTextContent("needs +2");
    expect(firstToggle?.querySelector(".sale-result-chevron")).not.toBeNull();
    expect(forecastPanel?.querySelector(".sale-result-body")).toBeNull();
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

    await startHotseatGame(user);

    expect(container.querySelector(".trend-card.focus-trend em")).toHaveTextContent("Сейчас");
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

  it("renders customer cards with direct image assets", () => {
    saveGameState({});
    const { container } = render(<App />);
    const sprite = container.querySelector<HTMLImageElement>(".customer-sprite");

    expect(sprite?.tagName).toBe("IMG");
    expect(sprite?.src).toContain("/assets/customers-128/");
    expect(sprite?.src).toContain(".png");
  });

  it("renders product cards with direct image assets", () => {
    saveGameState({});
    const { container } = render(<App />);
    const sprite = container.querySelector<HTMLImageElement>(".product-sprite");

    expect(sprite?.tagName).toBe("IMG");
    expect(sprite?.src).toContain("/assets/products/");
    expect(sprite?.src).toContain(".png");
  });

  it("presents the play menu with text tabs, compact guest ranked prompt, story mode, and custom table", () => {
    const { container } = render(<App />);
    const playTabs = within(container.querySelector(".play-tabs") as HTMLElement).getAllByRole("tab");

    expect(container.querySelector(".menu-header")).not.toBeNull();
    expect(container.querySelector(".top-bar")).toBeNull();
    expect(container.querySelector(".trend-strip")).toBeNull();
    expect(container.querySelector(".table-grid")).toBeNull();
    expect(container.querySelector(".event-panel")).toBeNull();
    expect(container.querySelector(".play-tabs")).not.toBeNull();
    expect(container.querySelector(".ranked-match-card")).not.toBeNull();
    expect(container.querySelector(".ranked-match-card.is-guest")).not.toBeNull();
    expect(screen.getByRole("tab", { name: /Рейтинг 1vs1/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Играть$/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Google/i })).toHaveAttribute("href", "/api/auth/google/start");
    expect(screen.getByRole("link", { name: /Discord/i })).toHaveAttribute("href", "/api/auth/discord/start");
    expect(screen.queryByText(/Поиск соперника/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Готов$/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/код лобби/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/выберите режим/i)).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /свой стол/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Сюжетный режим/i })).toBeInTheDocument();
    expect(playTabs.map((button) => button.textContent?.trim())).toEqual(["Рейтинг 1vs1", "Сюжетный режим", "2 игрока", "Обучение с ИИ", "Свой стол"]);
    expect(screen.queryByRole("button", { name: /^Уровни$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /против ии/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /обучение/i })).not.toBeInTheDocument();
    expect(container.querySelector(".menu-secondary-actions")).toBeNull();
    expect(container.querySelector(".play-menu-actions")).toBeNull();
    expect(container.querySelector(".menu-utility-actions")).not.toBeNull();
    expect(screen.getByRole("button", { name: /Об игре/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Лицензии/i })).toBeInTheDocument();
  });

  it("changes play tab content without starting a mode until the Play button is pressed", async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    await user.click(screen.getByRole("tab", { name: /^2 игрока$/i }));

    expect(container.querySelector(".app-shell")?.classList.contains("phase-menu")).toBe(true);
    expect(container.querySelector(".ranked-match-card")).toBeNull();
    expect(screen.getByRole("heading", { name: /^2 игрока$/i })).toBeInTheDocument();
    expect(screen.getByText(/локальная партия/i)).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /Обучение с ИИ/i }));

    expect(container.querySelector(".app-shell")?.classList.contains("phase-menu")).toBe(true);
    expect(screen.getByRole("heading", { name: /Обучение с ИИ/i })).toBeInTheDocument();
    expect(screen.getByText(/подсказками тренера/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Играть$/i })).toHaveClass("play-start-button");

    await user.click(screen.getByRole("button", { name: /^Играть$/i }));

    expect(container.querySelector(".app-shell")?.classList.contains("phase-planning")).toBe(true);
    expect(screen.getByText(/ИИ: Оппонент/i)).toBeInTheDocument();
  });

  it("shows story levels immediately inside the story play tab", async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    await user.click(screen.getByRole("tab", { name: /Сюжетный режим/i }));

    expect(container.querySelector(".play-level-road")).not.toBeNull();
    expect(screen.getByRole("button", { name: /^Уровень 1$/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /^Уровень 2$/i })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /^Играть$/i })).not.toBeInTheDocument();
  });

  it("separates custom table creation from joining by lobby code", async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    await user.click(screen.getByRole("tab", { name: /Свой стол/i }));

    expect(screen.getByRole("heading", { name: /Создать новый стол/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Создать стол/i })).toHaveClass("play-start-button");
    expect(screen.getByRole("heading", { name: /Войти по коду/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/Код лобби/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Войти за стол/i })).toBeInTheDocument();
    expect(container.querySelector(".custom-table-actions")).not.toBeNull();
  });

  it("shows game menu tabs for profile, leaderboard search, and DLC", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === "/api/auth/me") {
          return Response.json({ user: null });
        }
        if (String(url).startsWith("/api/ranked/leaderboard")) {
          return Response.json({
            leaderboard: [{ playerId: "p1", displayName: "Player One", avatarUrl: null, mmr: 1542, rankedGames: 7, wins: 5, losses: 2 }],
            page: 1,
            pageSize: 10,
            total: 1,
            totalPages: 1
          });
        }
        return Response.json({});
      })
    );

    render(<App />);

    expect(screen.getByRole("tab", { name: /Играть/i })).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: /Профиль/i }));
    expect(screen.getByText(/Войдите в аккаунт/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/имя для тестового входа/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Google/i })).toHaveAttribute("href", "/api/auth/google/start");
    await user.click(screen.getByRole("tab", { name: /Лидерборд/i }));
    const leaderboardTable = await screen.findByRole("table", { name: /Лидерборд/i });
    const leaderboardControls = document.querySelector(".leaderboard-controls");

    expect(leaderboardTable.querySelectorAll("tbody tr")).toHaveLength(1);
    expect(leaderboardTable.closest(".menu-panel")?.lastElementChild).toBe(leaderboardControls);
    expect(leaderboardControls?.firstElementChild).toHaveClass("leaderboard-search");
    expect(leaderboardControls?.querySelector(".leaderboard-search > span")).toBeNull();
    expect(leaderboardControls?.querySelector(".leaderboard-search-icon")).not.toBeNull();
    expect(leaderboardControls?.lastElementChild).toHaveClass("leaderboard-pagination");
    expect(leaderboardControls?.firstElementChild?.querySelector("input")).toBe(screen.getByLabelText(/поиск/i));
    expect((await screen.findAllByText(/Player One/i)).length).toBeGreaterThan(0);
    expect(screen.getByText(/1542 MMR/i)).toBeInTheDocument();
    await user.type(screen.getByLabelText(/поиск/i), "Player");
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/ranked/leaderboard?page=1&pageSize=10&search=Player"));
    await user.click(screen.getByRole("tab", { name: /DLC/i }));
    expect(screen.getByText(/В разработке/i)).toBeInTheDocument();
    expect(screen.getByText(/покупки будущих DLC/i)).toBeInTheDocument();
    expect(document.querySelector(".menu-empty-state")).not.toBeNull();
  });

  it("centers the empty leaderboard state while keeping controls at the bottom", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === "/api/auth/me") {
          return Response.json({ user: null });
        }
        if (String(url).startsWith("/api/ranked/leaderboard")) {
          return Response.json({ leaderboard: [], page: 1, pageSize: 10, total: 0, totalPages: 1 });
        }
        return Response.json({});
      })
    );
    render(<App />);

    await user.click(screen.getByRole("tab", { name: /Лидерборд/i }));

    expect(await screen.findByText(/Лидерборд пока пуст/i)).toHaveClass("leaderboard-empty-state");
    expect(screen.queryByRole("table", { name: /Лидерборд/i })).not.toBeInTheDocument();
    expect(document.querySelector(".leaderboard-panel")?.lastElementChild).toBe(document.querySelector(".leaderboard-controls"));
  });

  it("shows the match-found sound license from the menu", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: /Лицензии/i }));

    expect(
      screen.getByText(
        "Piano Notification 5b by FoolBoyMedia -- https://freesound.org/s/352654/ -- License: Attribution NonCommercial 4.0 used as match-found sound"
      )
    ).toBeInTheDocument();
  });

  it("shows the logged-in player MMR in profile", async () => {
    const user = userEvent.setup();
    const history = Array.from({ length: 21 }, (_, index) => {
      const winnerId = index % 2 === 0 ? "p1" : `p${index + 2}`;
      const loserId = winnerId === "p1" ? `p${index + 2}` : "p1";
      return {
        matchId: `m${index + 1}`,
        playerAId: "p1",
        playerBId: `p${index + 2}`,
        playerBDisplayName: `Opponent ${index + 1}`,
        winnerId,
        loserId,
        playerACoins: 10,
        playerBCoins: 5,
        playerASales: 4,
        playerBSales: 2,
        playerAMmrBefore: 1500,
        playerBMmrBefore: 1500,
        playerAMmrAfter: winnerId === "p1" ? 1518 : 1482,
        playerBMmrAfter: winnerId === "p1" ? 1482 : 1518,
        mmrChange: 18,
        firstPlayerId: "p1",
        createdAt: `2026-05-${String(21 - index).padStart(2, "0")}T00:00:00.000Z`
      };
    });
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/api/auth/me") {
        return Response.json({ user: { id: "p1", displayName: "Player One", avatarUrl: null, email: "player@example.com" } });
      }
      if (url === "/api/ranked/rating") {
        return Response.json({ rating: { playerId: "p1", mmr: 1518, rankedGames: 1, wins: 1, losses: 0, lastRankedAt: null } });
      }
      if (String(url).startsWith("/api/ranked/history")) {
        return Response.json({ history });
      }
      return Response.json({});
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    await user.click(screen.getByRole("tab", { name: /Профиль/i }));

    expect((await screen.findAllByText(/Player One/i)).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/1518 MMR/i)).length).toBeGreaterThan(0);
    expect(screen.queryByText(/\+18 MMR/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /История MMR/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/ranked/history?limit=20"));
    const rows = await waitFor(() => {
      const renderedRows = document.querySelectorAll(".match-history-row");
      expect(renderedRows).toHaveLength(20);
      return renderedRows;
    });
    expect(rows[0]).toHaveClass("is-win");
    expect(rows[1]).toHaveClass("is-loss");
    expect(screen.getByText("vs Opponent 1")).toBeInTheDocument();
    expect(screen.queryByText("vs Opponent 21")).not.toBeInTheDocument();
  });

  it("separates profile overview, settings, and account deletion into internal tabs", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === "/api/auth/me") {
          return Response.json({
            user: {
              id: "p1",
              displayName: "Player One",
              avatarUrl: null,
              avatarShape: "circle",
              email: "player@example.com",
              twoFactorEnabled: false,
              deactivatedAt: null,
              deleteAfter: null
            }
          });
        }
        if (url === "/api/ranked/rating") {
          return Response.json({
            rating: {
              playerId: "p1",
              mmr: 1518,
              rankedGames: 4,
              wins: 3,
              losses: 1,
              lastRankedAt: "2026-05-21T00:00:00.000Z",
              isCalibrating: false,
              calibrationGamesRemaining: 0,
              penalty: { leaveWarnings: 0, cleanGamesUntilForgiven: null, cooldownUntil: null, queueBlocked: false }
            }
          });
        }
        if (String(url).startsWith("/api/ranked/history")) {
          return Response.json({
            history: [
              {
                matchId: "m1",
                playerAId: "p1",
                playerBId: "p2",
                winnerId: "p1",
                loserId: "p2",
                playerACoins: 10,
                playerBCoins: 5,
                playerASales: 4,
                playerBSales: 2,
                playerAMmrBefore: 1500,
                playerBMmrBefore: 1500,
                playerAMmrAfter: 1518,
                playerBMmrAfter: 1482,
                mmrChange: 18,
                firstPlayerId: "p1",
                createdAt: "2026-05-21T00:00:00.000Z"
              }
            ]
          });
        }
        return Response.json({});
      })
    );

    render(<App />);
    await user.click(screen.getByRole("tab", { name: /^Профиль$/i }));

    const overviewTab = await screen.findByRole("tab", { name: /^Обзор$/i });
    expect(overviewTab).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByRole("img", { name: "MMR" })).toBeInTheDocument();
    expect(screen.getByText("75%")).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Ник$/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Подтверждение удаления/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /^Настройки$/i }));
    expect(await screen.findByLabelText(/^Ник$/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Настроить 2FA/i })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "MMR" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Подтверждение удаления/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /^Удаление аккаунта$/i }));
    expect(await screen.findByLabelText(/Подтверждение удаления/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Ник$/i)).not.toBeInTheDocument();
  });

  it("localizes the account deletion confirmation phrase in English", async () => {
    const user = userEvent.setup();
    saveGameState({ phase: "menu" }, null, { language: "en" });
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/auth/me") {
        return Response.json({
          user: {
            id: "p1",
            displayName: "Player One",
            avatarUrl: null,
            avatarShape: "circle",
            email: "player@example.com",
            twoFactorEnabled: false,
            deactivatedAt: null,
            deleteAfter: null
          }
        });
      }
      if (url === "/api/ranked/rating") {
        return Response.json({ rating: { playerId: "p1", mmr: 1518, rankedGames: 1, wins: 1, losses: 0, lastRankedAt: null } });
      }
      if (String(url).startsWith("/api/ranked/history")) {
        return Response.json({ history: [] });
      }
      if (url === "/api/auth/deactivate" && init?.method === "POST") {
        expect(init.body).toBe(JSON.stringify({ confirmation: "УДАЛИТЬ ПРОФИЛЬ" }));
        return Response.json({
          user: {
            id: "p1",
            displayName: "Player One",
            avatarUrl: null,
            avatarShape: "circle",
            email: "player@example.com",
            twoFactorEnabled: false,
            deactivatedAt: new Date().toISOString(),
            deleteAfter: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
          }
        });
      }
      return Response.json({});
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    await user.click(screen.getByRole("tab", { name: /^Profile$/i }));
    await user.click(await screen.findByRole("tab", { name: /^Delete account$/i }));

    const confirmation = await screen.findByLabelText(/Deletion confirmation/i);
    expect(confirmation).toHaveAttribute("placeholder", "DELETE PROFILE");
    expect(screen.queryByPlaceholderText("УДАЛИТЬ ПРОФИЛЬ")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Delete profile$/i })).toBeDisabled();

    await user.type(confirmation, "DELETE PROFILE");
    await user.click(screen.getByRole("button", { name: /^Delete profile$/i }));

    expect(await screen.findByText(/Profile will be deleted in/i)).toBeInTheDocument();
  });

  it("edits profile data and restricts the menu while profile deletion is pending", async () => {
    const user = userEvent.setup();
    const deleteAfter = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/auth/me") {
        return Response.json({
          user: { id: "p1", displayName: "Player One", avatarUrl: null, avatarShape: "circle", email: "player@example.com", twoFactorEnabled: false, deactivatedAt: null, deleteAfter: null }
        });
      }
      if (url === "/api/ranked/rating") {
        return Response.json({ rating: { playerId: "p1", mmr: 1518, rankedGames: 1, wins: 1, losses: 0, lastRankedAt: null } });
      }
      if (String(url).startsWith("/api/ranked/history")) {
        return Response.json({ history: [] });
      }
      if (url === "/api/auth/profile" && init?.method === "PATCH") {
        const form = init.body as FormData;
        expect(form.get("displayName")).toBe("New Nick");
        expect(form.get("avatarShape")).toBeNull();
        expect(form.get("avatar")).toBeInstanceOf(File);
        return Response.json({
          user: { id: "p1", displayName: "New Nick", avatarUrl: "/api/auth/avatar/p1.png", avatarShape: "circle", email: "player@example.com", twoFactorEnabled: false, deactivatedAt: null, deleteAfter: null }
        });
      }
      if (url === "/api/auth/deactivate" && init?.method === "POST") {
        expect(init.body).toBe(JSON.stringify({ confirmation: "УДАЛИТЬ ПРОФИЛЬ" }));
        return Response.json({
          user: { id: "p1", displayName: "New Nick", avatarUrl: "/api/auth/avatar/p1.png", avatarShape: "circle", email: "player@example.com", twoFactorEnabled: false, deactivatedAt: new Date().toISOString(), deleteAfter }
        });
      }
      if (url === "/api/auth/cancel-deletion" && init?.method === "POST") {
        return Response.json({
          user: { id: "p1", displayName: "New Nick", avatarUrl: "/api/auth/avatar/p1.png", avatarShape: "circle", email: "player@example.com", twoFactorEnabled: false, deactivatedAt: null, deleteAfter: null }
        });
      }
      if (url === "/api/ranked/status") {
        return Response.json({ status: "idle" });
      }
      return Response.json({});
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    await user.click(screen.getByRole("tab", { name: /Профиль/i }));
    expect(document.querySelector(".profile-sidebar")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Круг$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Скругл/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: /^Настройки$/i }));
    await user.clear(await screen.findByLabelText(/Ник/i));
    await user.type(screen.getByLabelText(/Ник/i), "New Nick");
    expect(screen.queryByRole("dialog", { name: /Кадр аватарки/i })).not.toBeInTheDocument();
    await user.upload(screen.getByLabelText(/Новая аватарка/i), new File(["avatar"], "avatar.png", { type: "image/png" }));
    expect(await screen.findByRole("dialog", { name: /Кадр аватарки/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Применить/i }));
    await user.click(screen.getByRole("button", { name: /Сохранить/i }));

    expect(await screen.findByText("Профиль обновлён.")).toBeInTheDocument();
    expect(screen.getAllByText("New Nick").length).toBeGreaterThan(0);

    await user.click(screen.getByRole("tab", { name: /^Удаление аккаунта$/i }));
    await user.type(screen.getByLabelText(/Подтверждение удаления/i), "УДАЛИТЬ ПРОФИЛЬ");
    await user.click(screen.getByRole("button", { name: /^Удалить профиль$/i }));

    const deletionTimer = await screen.findByText(/Профиль будет удалён через/i);
    expect(deletionTimer).toBeInTheDocument();
    expect(deletionTimer).not.toHaveTextContent(/\.\.$/);
    expect(screen.getByRole("tab", { name: /Играть/i })).toBeDisabled();
    expect(screen.getByRole("tab", { name: /Лидерборд/i })).toBeDisabled();
    expect(screen.getByRole("tab", { name: /DLC/i })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /Отменить удаление профиля/i }));

    expect(await screen.findByText("Удаление профиля отменено.")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Играть/i })).not.toBeDisabled();
  });

  it("sets up authenticator app two-factor authentication from the profile", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/auth/me") {
        return Response.json({
          user: { id: "p1", displayName: "Player One", avatarUrl: null, avatarShape: "circle", email: "player@example.com", twoFactorEnabled: false, deactivatedAt: null, deleteAfter: null }
        });
      }
      if (url === "/api/ranked/rating") {
        return Response.json({ rating: { playerId: "p1", mmr: 1518, rankedGames: 1, wins: 1, losses: 0, lastRankedAt: null } });
      }
      if (String(url).startsWith("/api/ranked/history")) {
        return Response.json({ history: [] });
      }
      if (url === "/api/auth/two-factor/setup" && init?.method === "POST") {
        return Response.json({ secret: "ABCDEFGHIJKLMNOPQRSTUVWX234567", otpauthUri: "otpauth://totp/Trend%20Market:Player%20One", qrCodeSvg: "<svg><path /></svg>" });
      }
      if (url === "/api/auth/two-factor/enable" && init?.method === "POST") {
        expect(init.body).toBe(JSON.stringify({ code: "123456" }));
        return Response.json({
          user: { id: "p1", displayName: "Player One", avatarUrl: null, avatarShape: "circle", email: "player@example.com", twoFactorEnabled: true, deactivatedAt: null, deleteAfter: null },
          recoveryCodes: ["ABCD-EFGH"]
        });
      }
      return Response.json({});
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    await user.click(screen.getByRole("tab", { name: /Профиль/i }));
    await user.click(screen.getByRole("tab", { name: /^Настройки$/i }));
    await user.click(await screen.findByRole("button", { name: /Настроить 2FA/i }));
    expect(await screen.findByRole("img", { name: /QR-код 2FA/i })).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Код из приложения/i), "123456");
    await user.click(screen.getByRole("button", { name: /Включить/i }));

    expect(await screen.findByText("2FA включена.")).toBeInTheDocument();
    expect(screen.getByText("ABCD-EFGH")).toBeInTheDocument();
  });

  it("shows and cancels the current ranked queue state for logged-in players", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/auth/me") {
        return Response.json({ user: { id: "p1", displayName: "Player One", avatarUrl: null, email: "player@example.com" } });
      }
      if (url === "/api/ranked/status") {
        return Response.json({ status: "waiting" });
      }
      if (url === "/api/ranked/queue" && init?.method === "DELETE") {
        return Response.json({ status: "idle" });
      }
      return Response.json({});
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByRole("button", { name: /Отмена/i })).toHaveClass("ranked-action");
    expect(screen.queryByText(/Вы в очереди рейтинга/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /Профиль/i }));
    const queueChip = await screen.findByRole("button", { name: /00:00/i });
    expect(queueChip).toHaveClass("menu-queue-chip");

    await user.click(queueChip);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/ranked/queue", { method: "DELETE" }));
    expect(screen.queryByText(/Очередь рейтинга отменена/i)).not.toBeInTheDocument();
  });

  it("shows ranked leave warnings and cooldown countdown on the ranked button", async () => {
    const cooldownUntil = Date.now() + 181_000;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === "/api/auth/me") {
          return Response.json({ user: { id: "p1", displayName: "Player One", avatarUrl: null, email: "player@example.com" } });
        }
        if (url === "/api/ranked/status") {
          return Response.json({ status: "idle" });
        }
        if (url === "/api/ranked/rating") {
          return Response.json({
            rating: {
              playerId: "p1",
              mmr: 1518,
              rankedGames: 4,
              wins: 2,
              losses: 2,
              lastRankedAt: null,
              isCalibrating: false,
              calibrationGamesRemaining: 0,
              penalty: {
                leaveWarnings: 3,
                cleanGamesUntilForgiven: 5,
                cooldownUntil,
                queueBlocked: true
              }
            }
          });
        }
        if (url === "/api/ranked/history") {
          return Response.json({ history: [] });
        }
        return Response.json({});
      })
    );

    render(<App />);

    await waitFor(() => expect(document.querySelector<HTMLButtonElement>(".ranked-action")).not.toBeNull());
    const rankedButton = document.querySelector<HTMLButtonElement>(".ranked-action")!;

    await waitFor(() => expect(rankedButton).toBeDisabled());
    expect(rankedButton.textContent).toContain("Доступно через");
    expect(rankedButton.textContent).toMatch(/0?3:0[01]/);
    expect(screen.getByText("Вы покинули рейтинговый матч. Повторные выходы приведут к временной блокировке ranked.")).toBeInTheDocument();
  });

  it("reconnects a restored active ranked match when the local player is marked disconnected", async () => {
    const rankedInitialState = { ...buildInitialState(true, 45), phase: "planning" as const, activePlayer: "A" as PlayerId, firstPlayer: "A" as PlayerId };
    const disconnectedMatch = {
      id: "match-1",
      playerAId: "p1",
      playerBId: "p2",
      playerAMmrBefore: 1500,
      playerBMmrBefore: 1500,
      firstPlayerId: "p1",
      seed: "seed-1",
      initialState: rankedInitialState,
      status: "active",
      createdAt: 1_000,
      playerADisconnectedAt: 1_000,
      playerBDisconnectedAt: null,
      isCalibration: false,
      isBotMatch: false,
      botDifficulty: null
    };
    const reconnectedMatch = { ...disconnectedMatch, playerADisconnectedAt: null };
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/auth/me") {
        return Response.json({ user: { id: "p1", displayName: "Player One", avatarUrl: null, email: "player@example.com" } });
      }
      if (url === "/api/ranked/status") {
        return Response.json({ status: "matched", match: disconnectedMatch });
      }
      if (url === "/api/ranked/reconnect" && init?.method === "POST") {
        return Response.json({ status: "matched", match: reconnectedMatch });
      }
      if (String(url).startsWith("/api/ranked/events?")) {
        return Response.json({ events: [] });
      }
      return Response.json({});
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/ranked/reconnect",
        expect.objectContaining({
          body: JSON.stringify({ matchId: "match-1" }),
          method: "POST"
        })
      )
    );
    await waitFor(() => expect(document.querySelector(".app-shell.phase-planning")).not.toBeNull());
  });

  it("abandons an active ranked match when exiting through the pause menu", async () => {
    const user = userEvent.setup();
    const rankedInitialState = { ...buildInitialState(true, 45), phase: "planning" as const, activePlayer: "A" as PlayerId, firstPlayer: "A" as PlayerId };
    const match = {
      id: "match-1",
      playerAId: "p1",
      playerBId: "p2",
      playerAMmrBefore: 1500,
      playerBMmrBefore: 1500,
      firstPlayerId: "p1",
      seed: "seed-1",
      initialState: rankedInitialState,
      status: "active",
      createdAt: 1_000,
      playerADisconnectedAt: null,
      playerBDisconnectedAt: null,
      isCalibration: false,
      isBotMatch: false,
      botDifficulty: null
    };
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/auth/me") {
        return Response.json({ user: { id: "p1", displayName: "Player One", avatarUrl: null, email: "player@example.com" } });
      }
      if (url === "/api/ranked/status") {
        return Response.json({ status: "matched", match });
      }
      if (String(url).startsWith("/api/ranked/events?")) {
        return Response.json({ events: [] });
      }
      if (url === "/api/ranked/abandon" && init?.method === "POST") {
        return Response.json({ log: { matchId: "match-1", winnerId: "p2", loserId: "p1", mmrChange: 24 } });
      }
      return Response.json({});
    });
    vi.stubGlobal("fetch", fetchMock);

    const { container } = render(<App />);

    await waitFor(() => expect(container.querySelector(".app-shell.phase-planning")).not.toBeNull());
    await user.click(container.querySelector<HTMLButtonElement>(".top-pause")!);
    await user.click(container.querySelector<HTMLButtonElement>(".pause-actions button:last-child")!);
    expect(screen.getByText(/поражение/i)).toBeInTheDocument();
    await user.click(container.querySelector<HTMLButtonElement>(".confirm-actions button:last-child")!);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/ranked/abandon",
        expect.objectContaining({
          body: JSON.stringify({ matchId: "match-1" }),
          method: "POST"
        })
      )
    );
    expect(fetchMock).not.toHaveBeenCalledWith("/api/ranked/disconnect", expect.anything());
  });

  it("keeps a ranked match open when surrender cannot be recorded", async () => {
    const user = userEvent.setup();
    const rankedInitialState = { ...buildInitialState(true, 45), phase: "planning" as const, activePlayer: "A" as PlayerId, firstPlayer: "A" as PlayerId };
    const match = {
      id: "match-1",
      playerAId: "p1",
      playerBId: "p2",
      playerAMmrBefore: 1500,
      playerBMmrBefore: 1500,
      firstPlayerId: "p1",
      seed: "seed-1",
      initialState: rankedInitialState,
      status: "active",
      createdAt: 1_000,
      playerADisconnectedAt: null,
      playerBDisconnectedAt: null,
      isCalibration: false,
      isBotMatch: false,
      botDifficulty: null
    };
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/auth/me") {
        return Response.json({ user: { id: "p1", displayName: "Player One", avatarUrl: null, email: "player@example.com" } });
      }
      if (url === "/api/ranked/status") {
        return Response.json({ status: "matched", match });
      }
      if (String(url).startsWith("/api/ranked/events?")) {
        return Response.json({ events: [] });
      }
      if (url === "/api/ranked/abandon" && init?.method === "POST") {
        return Response.json({ error: "Abandon failed." }, { status: 500 });
      }
      return Response.json({});
    });
    vi.stubGlobal("fetch", fetchMock);

    const { container } = render(<App />);

    await waitFor(() => expect(container.querySelector(".app-shell.phase-planning")).not.toBeNull());
    await user.click(container.querySelector<HTMLButtonElement>(".top-pause")!);
    await user.click(container.querySelector<HTMLButtonElement>(".pause-actions button:last-child")!);
    await user.click(container.querySelector<HTMLButtonElement>(".confirm-actions button:last-child")!);

    await waitFor(() => expect(screen.getByText(/Abandon failed/i)).toBeInTheDocument());
    expect(container.querySelector(".app-shell.phase-planning")).not.toBeNull();
  });

  it("starts a ranked match from a matched queue response", async () => {
    const user = userEvent.setup();
    const rankedInitialState = { ...buildInitialState(true, 45), phase: "planning" as const, activePlayer: "A" as PlayerId, firstPlayer: "A" as PlayerId };
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/auth/me") {
        return Response.json({ user: { id: "p1", displayName: "Player One", avatarUrl: null, email: "player@example.com" } });
      }
      if (url === "/api/ranked/status") {
        return Response.json({ status: "idle" });
      }
      if (url === "/api/ranked/queue" && init?.method === "POST") {
        return Response.json({
          status: "matched",
          match: {
            id: "match-1",
            playerAId: "p1",
            playerBId: "p2",
            playerAMmrBefore: 1500,
            playerBMmrBefore: 1500,
            firstPlayerId: "p1",
            seed: "seed-1",
            initialState: rankedInitialState,
            status: "active",
            createdAt: 1_000,
            playerADisconnectedAt: null,
            playerBDisconnectedAt: null
          }
        });
      }
      if (url === "/api/ranked/events" && init?.method === "POST") {
        return Response.json({ event: { sequence: 1 } });
      }
      return Response.json({});
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    const rankedButton = await screen.findByRole("button", { name: /^Играть$/i });
    await user.click(rankedButton);

    expect(await screen.findByRole("button", { name: /Матч найден/i })).toBeInTheDocument();
    const matchFoundAudio = mockAudioInstances.find((audio) => /matchfound\.mp3/.test(audio.src));
    expect(matchFoundAudio).toBeDefined();
    act(() => {
      matchFoundAudio?.emit("ended");
    });

    expect(await screen.findByText(/Рейтинговый матч начался/i)).toBeInTheDocument();
    expect(document.querySelector(".app-shell.phase-planning")).not.toBeNull();

    await user.click(screen.getByRole("button", { name: /Готов/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/ranked/events", expect.objectContaining({ method: "POST" })));
    const eventCall = fetchMock.mock.calls.find(([url, init]) => url === "/api/ranked/events" && init?.method === "POST");
    expect(JSON.parse(String(eventCall?.[1]?.body))).toEqual({ matchId: "match-1", round: 1, phase: "planning", eventType: "ready", payload: {} });
  });

  it("records ranked product placements as replay events", async () => {
    const user = userEvent.setup();
    const localPlayer = testPlayer("A");
    const productId = localPlayer.productHand[0].instanceId;
    const rankedInitialState = { ...buildInitialState(true, 45), phase: "planning" as const, activePlayer: "A" as PlayerId, players: [localPlayer, testPlayer("B")] };
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/auth/me") {
        return Response.json({ user: { id: "p1", displayName: "Player One", avatarUrl: null, email: "player@example.com" } });
      }
      if (url === "/api/ranked/status") {
        return Response.json({ status: "idle" });
      }
      if (url === "/api/ranked/queue" && init?.method === "POST") {
        return Response.json({
          status: "matched",
          match: {
            id: "match-1",
            playerAId: "p1",
            playerBId: "p2",
            playerAMmrBefore: 1500,
            playerBMmrBefore: 1500,
            firstPlayerId: "p1",
            seed: "seed-1",
            initialState: rankedInitialState,
            status: "active",
            createdAt: 1_000,
            playerADisconnectedAt: null,
            playerBDisconnectedAt: null
          }
        });
      }
      if (url === "/api/ranked/events" && init?.method === "POST") {
        return Response.json({ event: { sequence: 1 } });
      }
      return Response.json({ events: [] });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { container } = render(<App />);

    await waitFor(() => expect(container.querySelector<HTMLButtonElement>(".ranked-action")).not.toBeNull());
    await user.click(container.querySelector<HTMLButtonElement>(".ranked-action")!);
    act(() => {
      mockAudioInstances.find((audio) => /matchfound\.mp3/.test(audio.src))?.emit("ended");
    });
    await waitFor(() => expect(document.querySelector(".app-shell.phase-planning")).not.toBeNull());
    await user.click(container.querySelector<HTMLButtonElement>(`.hand-panel [data-correct-product-id="${productId}"]`)!);
    await user.click(container.querySelector<HTMLButtonElement>(".seat-local .empty-slot")!);

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) =>
            url === "/api/ranked/events" &&
            init?.method === "POST" &&
            JSON.stringify(JSON.parse(String(init.body))) === JSON.stringify({ matchId: "match-1", round: 1, phase: "planning", eventType: "place_product", payload: { productInstanceId: productId, slotIndex: 0 } })
        )
      ).toBe(true)
    );
  });

  it("applies opponent ranked events and settles the finished match", async () => {
    const user = userEvent.setup();
    const rankedInitialState = {
      ...buildInitialState(true, 45),
      phase: "planning" as const,
      round: 8,
      activePlayer: "A" as PlayerId,
      firstPlayer: "A" as PlayerId,
      players: [
        { ...testPlayer("A"), money: 10, productHand: [], influenceHand: [] },
        { ...testPlayer("B"), money: 5, productHand: [], influenceHand: [] }
      ]
    };
    let queueJoins = 0;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/auth/me") {
        return Response.json({ user: { id: "p1", displayName: "Player One", avatarUrl: null, email: "player@example.com" } });
      }
      if (url === "/api/ranked/status") {
        return Response.json({ status: "idle" });
      }
      if (url === "/api/ranked/queue" && init?.method === "POST") {
        queueJoins += 1;
        if (queueJoins > 1) {
          return Response.json({ status: "waiting" });
        }
        return Response.json({
          status: "matched",
          match: {
            id: "match-1",
            playerAId: "p1",
            playerBId: "p2",
            playerAMmrBefore: 1500,
            playerBMmrBefore: 1500,
            firstPlayerId: "p1",
            seed: "seed-1",
            initialState: rankedInitialState,
            status: "active",
            createdAt: 1_000,
            playerADisconnectedAt: null,
            playerBDisconnectedAt: null
          }
        });
      }
      if (url === "/api/ranked/events" && init?.method === "POST") {
        return Response.json({ event: { sequence: 1 } });
      }
      if (String(url).startsWith("/api/ranked/events?")) {
        const after = new URL(`http://test${url}`).searchParams.get("after");
        return Response.json({
          events:
            after === "1"
              ? [{ matchId: "match-1", sequence: 2, actorId: "p2", round: 8, phase: "planning", eventType: "ready", payload: {}, createdAt: 2_000 }]
              : []
        });
      }
      if (url === "/api/ranked/settle" && init?.method === "POST") {
        return Response.json({ log: { matchId: "match-1", winnerId: "p1", loserId: "p2", mmrChange: 18 } });
      }
      return Response.json({});
    });
    vi.stubGlobal("fetch", fetchMock);

    const { container } = render(<App />);

    await waitFor(() => expect(container.querySelector<HTMLButtonElement>(".ranked-action")).not.toBeNull());
    await user.click(container.querySelector<HTMLButtonElement>(".ranked-action")!);
    act(() => {
      mockAudioInstances.find((audio) => /matchfound\.mp3/.test(audio.src))?.emit("ended");
    });
    await waitFor(() => expect(document.querySelector(".app-shell.phase-planning")).not.toBeNull());
    await user.click(await waitFor(() => container.querySelector<HTMLButtonElement>(".hand-heading .primary-action")!));

    await waitFor(() => expect(document.querySelector(".app-shell.phase-game_end")).not.toBeNull());
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/ranked/settle",
        expect.objectContaining({
          body: JSON.stringify({ matchId: "match-1", playerACoins: 10, playerBCoins: 5, playerASales: 0, playerBSales: 0 }),
          method: "POST"
        })
      )
    );
    expect(await screen.findByText(/\+18 MMR/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Сыграть ещё/i }));

    await waitFor(() => expect(queueJoins).toBe(2));
  });

  it("rebuilds an active ranked match from stored event history", async () => {
    const rankedInitialState = {
      ...buildInitialState(true, 45),
      phase: "planning" as const,
      round: 8,
      activePlayer: "A" as PlayerId,
      firstPlayer: "A" as PlayerId,
      players: [
        { ...testPlayer("A"), productHand: [], influenceHand: [] },
        { ...testPlayer("B"), productHand: [], influenceHand: [] }
      ]
    };
    const match = {
      id: "match-1",
      playerAId: "p1",
      playerBId: "p2",
      playerAMmrBefore: 1500,
      playerBMmrBefore: 1500,
      firstPlayerId: "p1",
      seed: "seed-1",
      initialState: rankedInitialState,
      status: "active",
      createdAt: 1_000,
      playerADisconnectedAt: null,
      playerBDisconnectedAt: null
    };
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/auth/me") {
        return Response.json({ user: { id: "p1", displayName: "Player One", avatarUrl: null, email: "player@example.com" } });
      }
      if (url === "/api/ranked/status") {
        return Response.json({ status: "matched", match });
      }
      if (String(url).startsWith("/api/ranked/events?")) {
        const after = new URL(`http://test${url}`).searchParams.get("after");
        return Response.json({
          events:
            after === "0"
              ? [
                  { matchId: "match-1", sequence: 1, actorId: "p1", round: 8, phase: "planning", eventType: "ready", payload: {}, createdAt: 1_500 },
                  { matchId: "match-1", sequence: 2, actorId: "p2", round: 8, phase: "planning", eventType: "ready", payload: {}, createdAt: 2_000 }
                ]
              : []
        });
      }
      if (url === "/api/ranked/settle" && init?.method === "POST") {
        return Response.json({ log: { matchId: "match-1" } });
      }
      return Response.json({});
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    await waitFor(() => expect(document.querySelector(".app-shell.phase-game_end")).not.toBeNull());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/ranked/settle", expect.objectContaining({ method: "POST" })));
  });

  it("shows a ranked sync error instead of crashing on invalid stored event history", async () => {
    const rankedInitialState = {
      ...buildInitialState(true, 45),
      phase: "planning" as const,
      round: 1,
      activePlayer: "A" as PlayerId,
      firstPlayer: "A" as PlayerId,
      players: [
        { ...testPlayer("A"), productHand: [], influenceHand: [] },
        { ...testPlayer("B"), productHand: [], influenceHand: [] }
      ]
    };
    const match = {
      id: "match-1",
      playerAId: "p1",
      playerBId: "p2",
      playerAMmrBefore: 1500,
      playerBMmrBefore: 1500,
      firstPlayerId: "p1",
      seed: "seed-1",
      initialState: rankedInitialState,
      status: "active",
      createdAt: 1_000,
      playerADisconnectedAt: null,
      playerBDisconnectedAt: null,
      isCalibration: false,
      isBotMatch: false,
      botDifficulty: null
    };
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/api/auth/me") {
        return Response.json({ user: { id: "p1", displayName: "Player One", avatarUrl: null, email: "player@example.com" } });
      }
      if (url === "/api/ranked/status") {
        return Response.json({ status: "matched", match });
      }
      if (String(url).startsWith("/api/ranked/events?")) {
        return Response.json({
          events: [
            { matchId: "match-1", sequence: 1, actorId: "p1", round: 1, phase: "planning", eventType: "ready", payload: {}, createdAt: 1_500 },
            { matchId: "match-1", sequence: 2, actorId: "p1", round: 1, phase: "planning", eventType: "ready", payload: {}, createdAt: 1_600 }
          ]
        });
      }
      return Response.json({});
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByText("Invalid ranked ready action.")).toBeInTheDocument();
    expect(document.querySelector(".app-shell.phase-planning")).not.toBeNull();
  });

  it("does not show server deployment LAN hints in the main menu", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(fetchMock).not.toHaveBeenCalledWith("/api/network");
    expect(screen.queryByText(/npm run lan/i)).not.toBeInTheDocument();
    expect(document.querySelector(".lan-addresses")).toBeNull();
  });

  it("chooses AI opponent difficulty before starting a versus AI game", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const user = userEvent.setup();
    render(<App />);

    expect(screen.queryByRole("button", { name: /Против ИИ/i })).not.toBeInTheDocument();
    await startTrainingGame(user);
    expect(screen.getByText(/ИИ: Оппонент/i)).toBeInTheDocument();
    expect(screen.getByText(/совет тренера/i)).toBeInTheDocument();
    return;

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

    await openStoryLevelMap(user);

    expect(screen.getByRole("heading", { name: /Сюжетный режим/i })).toBeInTheDocument();
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

    await openStoryLevelMap(user);

    expect(buttonFromSelector(container, ".level-node:nth-child(1)")).toBeEnabled();
    expect(buttonFromSelector(container, ".level-node:nth-child(2)")).toBeDisabled();
    expectImagePreloaded("cutscene/aaakh-01.webp");
  });

  it("preloads the next cutscene card while the current one is shown", async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    await openStoryLevelMap(user);
    await user.click(buttonFromSelector(container, ".level-node:nth-child(1)"));

    expectImagePreloaded("cutscene/aaakh-02.webp");

    await user.click(buttonFromSelector(container, ".cutscene-subtitles .primary-action"));

    expectImagePreloaded("cutscene/aaakh-03.webp");
  });

  it("starts the first campaign level without trends, goals, or influence cards", async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    await openStoryLevelMap(user);
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

    openStoryLevelMapWithFireEvent();
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
    expect(screen.queryByRole("slider", { name: /время хода/i })).not.toBeInTheDocument();
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
    expect(screen.getByRole("tab", { name: /Story mode/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Versus AI/i })).not.toBeInTheDocument();

    firstRender.unmount();
    render(<App />);

    expect(screen.getByRole("tab", { name: /Story mode/i })).toBeInTheDocument();
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

    startHotseatGameWithFireEvent();
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

    startHotseatGameWithFireEvent();
    act(() => {
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

    startHotseatGameWithFireEvent();

    expect(screen.getByText(/Ход: 00:45/i)).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getByText(/Ход: 00:44/i)).toBeInTheDocument();
  });

  it("shows a short animated cue when control passes to the local turn", async () => {
    vi.useFakeTimers();
    const { container } = render(<App />);

    startHotseatGameWithFireEvent();

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

    startHotseatGameWithFireEvent();

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

  it("uses the default turn time for new local games", async () => {
    const user = userEvent.setup();
    saveGameState({ phase: "menu" }, null, { turnTimeSeconds: 30 });
    render(<App />);

    await startHotseatGame(user);

    expect(screen.getByText(/Ход: 00:45/i)).toBeInTheDocument();
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

      const body = JSON.parse(String(init.body)) as { turnTimeSeconds: number };
      postedTurnTime = body.turnTimeSeconds;
      postedState = { ...buildInitialState(true, body.turnTimeSeconds), phase: "planning" };
      return new Response(
        JSON.stringify({
          code: "ABCD2",
          playerId: "A",
          token: "host-token",
          version: 1,
          state: postedState,
          seats: { A: true, B: false }
        }),
        { status: 201, headers: { "Content-Type": "application/json" } }
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);

    await user.click(screen.getByRole("tab", { name: /Свой стол/i }));
    fireEvent.change(screen.getByRole("slider", { name: /время хода/i }), { target: { value: "30" } });
    await user.click(screen.getByRole("button", { name: /Создать стол/i }));

    await waitFor(() => expect(postedTurnTime).toBe(30));
    expect(await screen.findByRole("dialog", { name: /Ожидание второго игрока/i })).toBeInTheDocument();
    expect(screen.getByText("ABCD2")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Выйти$/i }));

    expect(screen.getByRole("tab", { name: /^2 игрока$/i })).toBeInTheDocument();
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

  it("retries lobby polling quietly before showing a reconnect notification with slower backoff", async () => {
    vi.useFakeTimers();
    const lobbyRequests: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === "/api/network") {
          return new Response(JSON.stringify({ urls: [] }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          });
        }

        if (url === "/api/lobbies/ABCD2") {
          lobbyRequests.push(url);
          throw new TypeError("Failed to fetch");
        }

        return new Response("{}", { status: 404 });
      })
    );
    saveGameState(
      {},
      {
        code: "ABCD2",
        playerId: "A",
        token: "host-token",
        version: 3,
        seats: { A: true, B: true }
      },
      { language: "en" }
    );

    render(<App />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(lobbyRequests).toHaveLength(1);
    expect(screen.queryByText(/Internet connection lost/i)).not.toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(999);
    });
    expect(lobbyRequests).toHaveLength(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(lobbyRequests).toHaveLength(2);
    expect(screen.queryByText(/Internet connection lost/i)).not.toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(lobbyRequests).toHaveLength(3);
    expect(screen.queryByText(/Internet connection lost/i)).not.toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4999);
    });
    expect(lobbyRequests).toHaveLength(3);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(lobbyRequests).toHaveLength(4);
    expect(screen.getByText(/Internet connection lost/i)).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(lobbyRequests).toHaveLength(5);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(lobbyRequests).toHaveLength(6);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20000);
    });
    expect(lobbyRequests).toHaveLength(7);
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

    await startHotseatGame(user);
    await user.click(screen.getByRole("button", { name: /Готов/i }));
    await user.click(screen.getByRole("button", { name: /Готов/i }));

    await user.click(screen.getByRole("button", { name: /Итоги прошлого раунда/i }));

    expect(screen.getByText(/Коротко о продажах/i)).toBeInTheDocument();
    expect(screen.getAllByText(/выбрал|ничего не купил|выбрала/i).length).toBeGreaterThan(0);
  });

  it("shows feedback when a shelf slot cannot accept a product", async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    await startHotseatGame(user);
    const unavailableSlot = screen.getAllByRole("button", { name: /слот товара/i })[0];

    expect(unavailableSlot).toHaveAttribute("aria-disabled", "true");

    await user.click(unavailableSlot);

    expect(container.querySelector(".shelf-slot.slot-rejecting")).not.toBeNull();
  });

  it("starts an AI training game and lets the AI score its planning turn", async () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    const user = userEvent.setup();
    render(<App />);

    await startTrainingGame(user);
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

    await startTrainingGame(user);

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

    expect(screen.queryByRole("button", { name: /против ии/i })).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Обучение с ИИ/i })).toBeInTheDocument();
    randomSpy.mockRestore();
    return;
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

    await startTrainingGame(user);

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
    let postedAuth: string | null = null;
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
        if (String(input).endsWith("/events") && init?.method === "POST") {
          postedAuth = new Headers(init.headers).get("authorization");
          const body = JSON.parse(String(init.body)) as { eventType: string };
          postedState = body.eventType === "restart" ? { ...saved.state, phase: "planning" } : saved.state;
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
    expect(postedAuth).toBe("Bearer host-token");
    expect(screen.getByText(/lobby code ABCD2/i)).toBeInTheDocument();
  });
});
