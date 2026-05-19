import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { CUSTOMER_CARDS, INFLUENCE_CARDS, PRODUCT_CARDS, TREND_CARDS, UPGRADE_CARDS } from "./data/cards";
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

function saveGameState(overrides: Record<string, unknown>) {
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
      lobby: null,
      audioSettings: {
        musicEnabled: true,
        effectsEnabled: true,
        musicVolume: 0.3,
        effectsVolume: 1
      }
    })
  );
}

describe("App layout shell", () => {
  beforeEach(() => {
    vi.useRealTimers();
    window.localStorage.clear();
    mockAudioInstances = [];
    Object.defineProperty(window, "Audio", {
      configurable: true,
      value: MockAudio as unknown as typeof Audio
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

  async function playUntilGameEnd(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: /Новая игра/i }));

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

  it("explains the rules in short child-friendly steps", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: /Правила/i }));

    expect(screen.getByText(/Коротко: продавай товары клиентам/i)).toBeInTheDocument();
    expect(screen.getByText(/В свой ход сделай до двух вещей/i)).toBeInTheDocument();
    expect(screen.getByText(/Главный тег клиента даёт \+3/i)).toBeInTheDocument();
    expect(screen.getByText(/Тренд не заменяет желание клиента/i)).toBeInTheDocument();
    expect(screen.getByText(/желание клиента и тренд складываются/i)).toBeInTheDocument();
    expect(screen.getByText(/лучший выбор — товар, где совпали и клиент, и тренд/i)).toBeInTheDocument();
    expect(screen.getByText(/Если товар набрал меньше 5/i)).toBeInTheDocument();
    expect(screen.getByText(/После 8 раунда побеждает тот, у кого больше монет/i)).toBeInTheDocument();
  });

  it("labels local player as you and the other seat as opponent", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getAllByText("Вы").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Оппонент").length).toBeGreaterThan(0);
    expect(screen.queryByText(/Игрок A|Игрок B/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Против ИИ/i }));

    expect(screen.getByText(/ИИ: Оппонент/i)).toBeInTheDocument();
    expect(screen.queryByText(/ИИ игрок B/i)).not.toBeInTheDocument();
  });

  it("switches the shell layout class when the planning phase starts", async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    await user.click(screen.getAllByRole("button")[0]);

    expect(container.querySelector(".app-shell")?.classList.contains("phase-planning")).toBe(true);
  });

  it("restores an active local game after a page reload", async () => {
    const user = userEvent.setup();
    const firstRender = render(<App />);

    await user.click(screen.getByRole("button", { name: /Новая игра/i }));

    await waitFor(() => {
      const savedSession = window.localStorage.getItem("trend-market-session-v1");
      expect(savedSession).not.toBeNull();
      expect(savedSession ?? "").toContain('"phase":"planning"');
    });
    expect(firstRender.container.querySelector(".app-shell")?.classList.contains("phase-planning")).toBe(true);

    firstRender.unmount();
    const secondRender = render(<App />);

    expect(secondRender.container.querySelector(".app-shell")?.classList.contains("phase-planning")).toBe(true);
    expect(screen.getByText(/Ход: 01:00/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Новая игра/i })).not.toBeInTheDocument();
  });

  it("shows a read-only sales forecast during planning", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getAllByRole("button")[0]);

    expect(screen.getByText(/прогноз продаж/i)).toBeInTheDocument();
    expect(screen.getByText(/если считать сейчас/i)).toBeInTheDocument();
    expect(screen.getAllByText(/0/).length).toBeGreaterThan(0);
  });

  it("shows three party goals when a game starts", async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    await user.click(screen.getByRole("button", { name: /Новая игра/i }));

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
      fireEvent.click(screen.getByRole("button", { name: /Новая игра/i }));
    });

    expect(screen.getByText(/Ход: 01:00/i)).toBeInTheDocument();

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /Пауза/i }));
    });

    expect(screen.getByRole("dialog", { name: /Пауза/i })).toBeInTheDocument();
    expect(mockAudioInstances[0].volume).toBeCloseTo(0.03);

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.getByText(/Ход: 01:00/i)).toBeInTheDocument();

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /Продолжить/i }));
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getByText(/Ход: 00:59/i)).toBeInTheDocument();
  });

  it("exits from pause to the main menu and clears the saved active game", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: /Новая игра/i }));
    await waitFor(() => expect(window.localStorage.getItem("trend-market-session-v1")).toContain('"phase":"planning"'));

    await user.click(screen.getByRole("button", { name: /Пауза/i }));
    await user.click(screen.getByRole("button", { name: /Выйти в меню/i }));

    expect(screen.getByRole("button", { name: /Новая игра/i })).toBeInTheDocument();
    await waitFor(() => expect(window.localStorage.getItem("trend-market-session-v1")).toBeNull());
  });

  it("keeps in-game settings inside a vertical pause menu", async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    await user.click(screen.getByRole("button", { name: /Новая игра/i }));

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

  it("pauses on sale resolution after both players are ready and then continues", async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    await user.click(screen.getAllByRole("button")[0]);
    await user.click(screen.getByRole("button", { name: /готов/i }));
    await user.click(screen.getByRole("button", { name: /готов/i }));

    expect(container.querySelector(".app-shell")?.classList.contains("phase-sale_resolution")).toBe(true);
    expect(screen.getAllByText(/итоги продаж/i).length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: /продолжить/i }));

    expect(container.querySelector(".app-shell")?.classList.contains("phase-sale_resolution")).toBe(false);
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

  it("renders card copy areas that can constrain labels inside cards", async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    await user.click(screen.getAllByRole("button")[0]);

    expect(screen.getByText(/Главный тренд/i)).toBeInTheDocument();
    expect(container.querySelector(".trend-card.focus-trend")).not.toBeNull();
    expect(container.querySelector(".trend-card .trend-copy")).not.toBeNull();
    expect(container.querySelector(".customer-card .customer-copy")).not.toBeNull();
    expect(container.querySelector(".product-card .product-copy")).not.toBeNull();
    expect(container.querySelector(".influence-card .influence-copy")).not.toBeNull();
  });

  it("uses responsive customer atlas assets instead of the oversized source atlas", () => {
    const { container } = render(<App />);
    const sprite = container.querySelector<HTMLElement>(".customer-sprite");
    const atlas = sprite?.style.getPropertyValue("--sprite-atlas");

    expect(atlas).toContain("customer-atlas-128.png");
    expect(atlas).toContain("customer-atlas-256.png");
  });

  it("presents menu actions in clear play and online sections", () => {
    render(<App />);

    expect(screen.getByText(/выберите режим/i)).toBeInTheDocument();
    expect(screen.getByText(/игра по сети/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /против ии/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /обучение/i })).toBeInTheDocument();
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
    expect(screen.getByText(/сейчас играет: Main Menu/i)).toBeInTheDocument();
  });

  it("uses menu music before the game and fades into Stroll when play starts", async () => {
    vi.useFakeTimers();
    render(<App />);

    expect(mockAudioInstances[0].src).toContain("main-menu.mp3");

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /Новая игра/i }));
    });
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(mockAudioInstances[0].src).toContain("stroll.mp3");
    expect(mockAudioInstances[0].currentTime).toBe(0);
  });

  it("keeps a manually selected game track across phase changes and advances after it ends", async () => {
    vi.useFakeTimers();
    render(<App />);

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /Новая игра/i }));
      vi.advanceTimersByTime(2000);
    });
    expect(mockAudioInstances[0].src).toContain("stroll.mp3");

    fireEvent.click(screen.getByRole("button", { name: /Пауза/i }));
    fireEvent.click(screen.getByRole("button", { name: /Настройки/i }));
    fireEvent.click(screen.getByRole("button", { name: /Следующий трек/i }));
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(mockAudioInstances[0].src).toContain("loficomfy.mp3");

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /Закрыть настройки/i }));
      fireEvent.click(screen.getByRole("button", { name: /Продолжить/i }));
      fireEvent.click(screen.getByRole("button", { name: /Готов/i }));
      fireEvent.click(screen.getByRole("button", { name: /Готов/i }));
      vi.advanceTimersByTime(2000);
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
      fireEvent.click(screen.getByRole("button", { name: /Новая игра/i }));
    });

    expect(screen.getByText(/Ход: 01:00/i)).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getByText(/Ход: 00:59/i)).toBeInTheDocument();
  });

  it("does not render the opponent-benefit warning copy", () => {
    render(<App />);

    expect(screen.queryByText(/Внимание: эффект выгоднее сопернику/i)).not.toBeInTheDocument();
  });

  it("shows short sales insight feedback after resolving sales", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: /Новая игра/i }));
    await user.click(screen.getByRole("button", { name: /Готов/i }));
    await user.click(screen.getByRole("button", { name: /Готов/i }));

    expect(screen.getByText(/Коротко о продажах/i)).toBeInTheDocument();
    expect(screen.getAllByText(/выбрал|ничего не купил|выбрала/i).length).toBeGreaterThan(0);
  });

  it("shows feedback when a shelf slot cannot accept a product", async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    await user.click(screen.getAllByRole("button")[0]);
    const unavailableSlot = screen.getAllByRole("button", { name: /слот товара/i })[0];

    expect(unavailableSlot).toHaveAttribute("aria-disabled", "true");

    await user.click(unavailableSlot);

    expect(container.querySelector(".shelf-slot.slot-rejecting")).not.toBeNull();
  });

  it("starts an AI training game and lets the AI score its planning turn", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: /обучение/i }));
    await user.click(screen.getByRole("button", { name: /Готов/i }));

    await waitFor(
      () => {
        expect(screen.getByText(/ИИ: Оппонент/i)).toBeInTheDocument();
        expect(screen.getByText(/оценка хода/i)).toBeInTheDocument();
      },
      { timeout: 2500 }
    );
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
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: /против ии/i }));

    expect(screen.getByText(/ИИ: Оппонент/i)).toBeInTheDocument();
    expect(screen.queryByText(/совет тренера/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Готов/i }));

    await waitFor(
      () => {
        expect(screen.getAllByText(/Оппонент (делает ставку|выставил|сыграл|копит|купил)/i).length).toBeGreaterThan(0);
      },
      { timeout: 2500 }
    );
  });

  it("lets the AI activate ad table before passing planning back", async () => {
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
});
