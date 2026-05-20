import type {
  CustomerCard,
  InfluenceCard,
  ProductInstance,
  Tag,
  TrendCard,
  UpgradeCard
} from "./game/types";
import type { PartyGoal } from "./game/goals";

type PartyGoalLike = Pick<PartyGoal, "id" | "title" | "kind" | "target" | "tag" | "minPrice" | "maxPrice">;

export type Language = "ru" | "en";

export const LANGUAGE_OPTIONS: Array<{ value: Language; label: string }> = [
  { value: "ru", label: "Русский" },
  { value: "en", label: "English" }
];

export function normalizeLanguage(value: unknown): Language {
  return value === "en" ? "en" : "ru";
}

export const UI_TEXT = {
  ru: {
    languageName: "Русский",
    you: "Вы",
    opponent: "Оппонент",
    player: "игрок",
    localTable: "локальный стол",
    menuSubtitle: "Разложите товары и постарайтесь заработать больше соперника.",
    chooseMode: "Выберите режим",
    campaignMode: "Ярмарка мира Ааах",
    twoPlayers: "2 игрока",
    versusAi: "Против ИИ",
    aiTraining: "Обучение с ИИ",
    onlineGame: "Игра по сети",
    createTable: "Создать стол",
    lobbyCodePlaceholder: "Код лобби",
    joinTable: "Войти за стол",
    rules: "Правила",
    settings: "Настройки",
    about: "Об игре",
    supportProject: "Поддержать проект",
    lobbyHint: "Для игры с двух компьютеров запустите `npm run lan`, откройте адрес на втором компьютере, создайте стол и передайте код лобби.",
    lanAddressLabel: "Адрес для игроков",
    back: "Назад",
    levelMapIntro: "Пройдите 24 лавки, открывая новых соперников и приближаясь к красивой новой шляпе.",
    level: "Уровень",
    cutsceneLabel: "Вступительная катсцена",
    skip: "Пропустить",
    startLevel: "Начать уровень",
    next: "Далее",
    roundFirstTurn: "Раунд {round} / 8 · первый ход: {player}",
    campaignRound: "Уровень {level} / {total} · раунд {round} / 8",
    ai: "ИИ",
    aiScore: "оценка хода {score}",
    aiWaiting: "Оппонент присматривается к рынку.",
    sales: "продажи",
    pause: "Пауза",
    soon: "Скоро",
    focusTrend: "Главный тренд",
    yourStall: "Ваш прилавок",
    opponentStall: "Прилавок соперника",
    noUpgrades: "без апгрейдов",
    replace: "заменить",
    placeHere: "поставить сюда",
    productSlot: "слот товара",
    saleForecast: "Прогноз продаж",
    saleResults: "Итоги продаж",
    saleCalculation: "Расчёт продаж",
    forecastNote: "Прогноз: если считать сейчас.",
    saleInsights: "Коротко о продажах",
    noForecastProducts: "Пока на полках нет подходящих товаров для прогноза.",
    saleFormulaAfterReady: "После готовности обоих игроков здесь появится формула выбора клиента.",
    previousSales: "Итоги прошлого раунда",
    noPurchase: "без покупки",
    log: "Лог",
    collapseLog: "Свернуть лог",
    showLog: "Показать лог",
    partyGoals: "Цели партии",
    yourTurn: "Ваш ход!",
    hotseatTurn: "Ход игрока {player}",
    opponentTurn: "Ход соперника",
    productChosen: "товар выбран",
    productToSlot: "1. товар -> слот",
    influencePlayed: "влияние сыграно",
    influenceOrSkip: "2. влияние или пропуск",
    readyStep: "3. готов",
    turnTimer: "Таймер хода",
    turnTimeShort: "Ход: {time}",
    opponentTurnTimeShort: "Ход оппонента: {time}",
    upgradeTimeShort: "Апгрейд: {time}",
    ready: "Готов",
    coachAdvice: "Совет тренера",
    handProducts: "Товары в руке",
    influence: "Влияние",
    ownImpact: "ваши",
    opponentImpact: "соперник",
    ownSlot: "свой слот {slot}",
    opponentSlot: "слот соперника {slot}",
    playInfluence: "Сыграть влияние",
    saleResolutionText: "Деньги и запасы уже обновлены. Проверьте формулы справа, затем продолжайте рынок.",
    continue: "Продолжить",
    upgradeShop: "Магазин апгрейдов",
    upgradeShopText: "Выбирает {player}. Можно купить один апгрейд или пропустить.",
    skipUpgrade: "Пропустить",
    marketSmiles: "Рынок улыбается",
    newDay: "Завтра будет новый день",
    friendlyFinal: "Дружеский финал",
    levelMap: "Карта уровней",
    exit: "Выйти",
    lobbyWaitTitle: "Ожидание второго игрока",
    lobbyWaitText: "Передайте код лобби второму игроку.",
    lobbyCode: "Код лобби",
    keepOneCard: "Оставьте одну карту",
    pauseTitle: "Партия на паузе",
    pausedBy: "Поставил: {player}. Таймер, ИИ и игровые действия остановлены.",
    exitToMenu: "Выйти в меню",
    exitConfirmText: "Вы действительно хотите выйти? Текущая партия будет закрыта.",
    stay: "Остаться",
    aiDifficulty: "Сложность ИИ",
    close: "Закрыть",
    closeSettings: "Закрыть настройки",
    language: "Язык",
    backgroundMusic: "Фоновая музыка",
    backgroundMusicHelp: "Треки из папки music играют по очереди.",
    musicVolume: "Громкость музыки",
    soundEffects: "Звуковые эффекты",
    soundEffectsHelp: "Щелчки карт, монеты и окончание раунда.",
    effectsVolume: "Громкость эффектов",
    turnTimeSetting: "Время хода: {seconds} сек.",
    turnTime: "Время хода",
    onlineTurnTimeLocked: "В онлайн-столе время хода задаёт создатель лобби.",
    nowPlaying: "Сейчас играет: {track}",
    status: "Статус: {status}",
    nextTrack: "Следующий трек",
    aboutText1: "Игра сделана как личное развлечение, чтобы я мог поиграть со своей девушкой, а не как серьёзный проект.",
    aboutText2: "Весь арт, включая музыку, сгенерирован через ИИ. Если кто-то из художников хочет нарисовать арт или написать музыкальное сопровождение, я всегда рад такому.",
    rulesIntro: "Руководство к партии: как подготовить прилавок, посчитать привлекательность, провести продажи и определить победителя.",
    playAgain: "Сыграть ещё",
    nextLevel: "Следующий уровень",
    retryLevel: "Повторить уровень"
  },
  en: {
    languageName: "English",
    you: "You",
    opponent: "Opponent",
    player: "player",
    localTable: "local table",
    menuSubtitle: "Arrange products and try to earn more than your rival.",
    chooseMode: "Choose mode",
    campaignMode: "World Fair of Aaakh",
    twoPlayers: "2 players",
    versusAi: "Versus AI",
    aiTraining: "AI training",
    onlineGame: "Online game",
    createTable: "Create table",
    lobbyCodePlaceholder: "Lobby code",
    joinTable: "Join table",
    rules: "Rules",
    settings: "Settings",
    about: "About",
    supportProject: "Support the project",
    lobbyHint: "To play from two computers, run `npm run lan`, open the address on the second computer, create a table, and share the lobby code.",
    lanAddressLabel: "Player address",
    back: "Back",
    levelMapIntro: "Play through 24 stalls, unlock new rivals, and move closer to a beautiful new hat.",
    level: "Level",
    cutsceneLabel: "Intro cutscene",
    skip: "Skip",
    startLevel: "Start level",
    next: "Next",
    roundFirstTurn: "Round {round} / 8 · first turn: {player}",
    campaignRound: "Level {level} / {total} · round {round} / 8",
    ai: "AI",
    aiScore: "turn score {score}",
    aiWaiting: "The opponent is studying the market.",
    sales: "sales",
    pause: "Pause",
    soon: "Soon",
    focusTrend: "Main trend",
    yourStall: "Your stall",
    opponentStall: "Opponent stall",
    noUpgrades: "no upgrades",
    replace: "replace",
    placeHere: "place here",
    productSlot: "product slot",
    saleForecast: "Sales forecast",
    saleResults: "Sales results",
    saleCalculation: "Sales calculation",
    forecastNote: "Forecast: if sales resolved now.",
    saleInsights: "Sales summary",
    noForecastProducts: "There are no suitable shelf products for a forecast yet.",
    saleFormulaAfterReady: "After both players are ready, the customer choice formula will appear here.",
    previousSales: "Previous sales",
    noPurchase: "no purchase",
    log: "Log",
    collapseLog: "Collapse log",
    showLog: "Show log",
    partyGoals: "Party goals",
    yourTurn: "Your turn!",
    hotseatTurn: "Player {player}'s turn",
    opponentTurn: "Opponent turn",
    productChosen: "product chosen",
    productToSlot: "1. product -> slot",
    influencePlayed: "influence played",
    influenceOrSkip: "2. influence or skip",
    readyStep: "3. ready",
    turnTimer: "Turn timer",
    turnTimeShort: "Turn: {time}",
    opponentTurnTimeShort: "Opponent turn: {time}",
    upgradeTimeShort: "Upgrade: {time}",
    ready: "Ready",
    coachAdvice: "Coach advice",
    handProducts: "Products in hand",
    influence: "Influence",
    ownImpact: "yours",
    opponentImpact: "opponent",
    ownSlot: "own slot {slot}",
    opponentSlot: "opponent slot {slot}",
    playInfluence: "Play influence",
    saleResolutionText: "Money and stock are already updated. Check the formulas on the right, then continue the market.",
    continue: "Continue",
    upgradeShop: "Upgrade shop",
    upgradeShopText: "{player} chooses. Buy one upgrade or skip.",
    skipUpgrade: "Skip",
    marketSmiles: "The market smiles",
    newDay: "Tomorrow is a new day",
    friendlyFinal: "Friendly final",
    levelMap: "Level map",
    exit: "Exit",
    lobbyWaitTitle: "Waiting for second player",
    lobbyWaitText: "Share the lobby code with the second player.",
    lobbyCode: "Lobby code",
    keepOneCard: "Keep one card",
    pauseTitle: "Party paused",
    pausedBy: "Paused by: {player}. Timer, AI, and game actions are stopped.",
    exitToMenu: "Exit to menu",
    exitConfirmText: "Do you really want to exit? The current party will be closed.",
    stay: "Stay",
    aiDifficulty: "AI difficulty",
    close: "Close",
    closeSettings: "Close settings",
    language: "Language",
    backgroundMusic: "Background music",
    backgroundMusicHelp: "Tracks from the music folder play in sequence.",
    musicVolume: "Music volume",
    soundEffects: "Sound effects",
    soundEffectsHelp: "Card clicks, coins, and round-end cues.",
    effectsVolume: "Effects volume",
    turnTimeSetting: "Turn time: {seconds} sec.",
    turnTime: "Turn time",
    onlineTurnTimeLocked: "At an online table, the lobby creator sets the turn time.",
    nowPlaying: "Now playing: {track}",
    status: "Status: {status}",
    nextTrack: "Next track",
    aboutText1: "This game is a personal project made for playing together, not a serious commercial project.",
    aboutText2: "All art, including music, was generated with AI. If an artist wants to draw art or write music for it, I would be glad.",
    rulesIntro: "Game guide: prepare shelves, score appeal, resolve sales, and decide the winner.",
    playAgain: "Play again",
    nextLevel: "Next level",
    retryLevel: "Retry level"
  }
} as const;

type UiKey = keyof typeof UI_TEXT.ru | keyof typeof UI_TEXT.en;

type CampaignLevelLike = {
  level: number;
  title: string;
  district: string;
  story: string;
  opponentSpecies: string;
};

const CAMPAIGN_LEVEL_TEXT: Record<number, { title: string; district: string; story: string; opponentSpecies: string }> = {
  1: { title: "First Pastries", district: "Fair Gates", story: "The fair in Aaakh has only just begun.", opponentSpecies: "young mouse" },
  2: { title: "Sweet Row", district: "Bakery Street", story: "Our stall is becoming more popular every day.", opponentSpecies: "kitten" },
  3: { title: "Coffee Chime", district: "Morning Canopy", story: "The nearby sellers are already watching us closely.", opponentSpecies: "young squirrel" },
  4: { title: "Toy Queue", district: "Kids' Alley", story: "One more good day and the dream gets closer.", opponentSpecies: "puppy" },
  5: { title: "Lemonade Buzz", district: "Sunny Square", story: "The new hat is not so far away now.", opponentSpecies: "duckling" },
  6: { title: "Berry Hour", district: "Garden Passage", story: "The end of the first fair day is near.", opponentSpecies: "young hedgehog" },
  7: { title: "Cheese Turn", district: "Farmers' Circle", story: "New customers are looking for the freshest goods.", opponentSpecies: "young goat" },
  8: { title: "Quick Lunch", district: "Lunch Bridge", story: "Customers are in a hurry, and every display matters.", opponentSpecies: "young raccoon" },
  9: { title: "Gift Boom", district: "Holiday Court", story: "The world of Aaakh is starting to talk about our stall.", opponentSpecies: "young fox" },
  10: { title: "Honey Display", district: "Bee Corner", story: "The savings jar for the new hat rings more often.", opponentSpecies: "bear cub" },
  11: { title: "Tourist Flow", district: "Souvenir Lane", story: "Fair guests are looking for something special.", opponentSpecies: "panda" },
  12: { title: "Evening Packaging", district: "Lantern Lights", story: "Rivals are starting to play more carefully.", opponentSpecies: "hamster" },
  13: { title: "Discount Day", district: "Coin Square", story: "Now every coin matters.", opponentSpecies: "young hare" },
  14: { title: "Big Signs", district: "Craftsmen Row", story: "Bright signs are pulling customers away.", opponentSpecies: "young deer" },
  15: { title: "Fresh Delivery", district: "Green Market", story: "Good products run out faster than usual.", opponentSpecies: "sheep" },
  16: { title: "Queue Next Door", district: "Noisy Crossing", story: "Neighbors are checking our prices more often.", opponentSpecies: "young penguin" },
  17: { title: "Fashionable Stall", district: "Blogger Plaza", story: "Trend-focused customers demand precision.", opponentSpecies: "young lynx" },
  18: { title: "Almost Champion", district: "Middle Dome", story: "The new hat is almost within reach.", opponentSpecies: "little bird" },
  19: { title: "Golden Passage", district: "Luxury Alley", story: "Wealthy guests expect expensive, beautiful goods.", opponentSpecies: "squirrel" },
  20: { title: "Loud Finale", district: "Main Stage", story: "The fair finale is close.", opponentSpecies: "young otter" },
  21: { title: "Hat Hint", district: "Milliners' Street", story: "The shop window already shows the hat from our dream.", opponentSpecies: "rabbit" },
  22: { title: "Last Coins", district: "Cashier Yard", story: "Every customer can decide the fate of a sale.", opponentSpecies: "guinea pig" },
  23: { title: "Main Rival", district: "Grand Tent", story: "The best sellers of Aaakh have gathered near the main tent.", opponentSpecies: "fox" },
  24: { title: "New Hat", district: "Hat Shop", story: "One last victory stands between us and the beautiful new hat.", opponentSpecies: "rabbit" }
};

const CUTSCENE_TEXT_EN = [
  "In the world of Aaakh, a grand fair is beginning.",
  "Every year, the best sellers gather at the Great Fair of Aaakh.",
  "This time, we have a goal: earn enough for a new hat.",
  "To buy it, we need to become the best sellers at the fair.",
  "Our stall is ready. Everything is just beginning.",
  "Victory will not come easily.",
  "The first customer is already coming!",
  "Time to open the stall and start the path to the new hat."
] as const;

const AI_DIFFICULTY_TEXT: Record<string, { en: string }> = {
  "Картошка": { en: "Potato" },
  "Купи слона": { en: "Buy an Elephant" },
  "Зазывала": { en: "Barker" },
  "Волк с Уолл-стрит": { en: "Wall Street Wolf" },
  "Бизнес-Енот": { en: "Business Raccoon" }
};

export function ui(language: Language, key: UiKey, values: Record<string, string | number> = {}) {
  const dictionary = UI_TEXT[language] as Record<string, string>;
  const fallback = UI_TEXT.ru as Record<string, string>;
  let text: string = dictionary[key] ?? fallback[key] ?? String(key);
  for (const [name, value] of Object.entries(values)) {
    text = text.replace(`{${name}}`, String(value));
  }
  return text;
}

export function campaignLevelTitle(language: Language, level: CampaignLevelLike) {
  return language === "en" ? CAMPAIGN_LEVEL_TEXT[level.level]?.title ?? level.title : level.title;
}

export function campaignLevelDistrict(language: Language, level: CampaignLevelLike) {
  return language === "en" ? CAMPAIGN_LEVEL_TEXT[level.level]?.district ?? level.district : level.district;
}

export function campaignLevelStory(language: Language, level: CampaignLevelLike) {
  return language === "en" ? CAMPAIGN_LEVEL_TEXT[level.level]?.story ?? level.story : level.story;
}

export function campaignLevelSpecies(language: Language, level: CampaignLevelLike) {
  return language === "en" ? CAMPAIGN_LEVEL_TEXT[level.level]?.opponentSpecies ?? level.opponentSpecies : level.opponentSpecies;
}

export function cutsceneText(language: Language, frameIndex: number, fallback: string) {
  return language === "en" ? CUTSCENE_TEXT_EN[frameIndex] ?? fallback : fallback;
}

export function aiDifficultyLabel(language: Language, difficulty: { label: string }) {
  return language === "en" ? AI_DIFFICULTY_TEXT[difficulty.label]?.en ?? difficulty.label : difficulty.label;
}

const TAG_TEXT: Record<Language, Record<Tag, string>> = {
  ru: {
    сладкое: "сладкое",
    напиток: "напиток",
    дешёвое: "дешёвое",
    дорогое: "дорогое",
    свежее: "свежее",
    быстрое: "быстрое",
    детское: "детское",
    местное: "местное"
  },
  en: {
    сладкое: "sweet",
    напиток: "drink",
    дешёвое: "budget",
    дорогое: "premium",
    свежее: "fresh",
    быстрое: "quick",
    детское: "kids",
    местное: "local"
  }
};

export function tagText(language: Language, tag: Tag) {
  return TAG_TEXT[language][tag] ?? tag;
}

const PRODUCT_TEXT: Record<string, { ru: string; en: string }> = {
  bread: { ru: "Хлеб", en: "Bread" },
  coffee: { ru: "Кофе", en: "Coffee" },
  cake: { ru: "Торт", en: "Cake" },
  berries: { ru: "Ягоды", en: "Berries" },
  lemonade: { ru: "Лимонад", en: "Lemonade" },
  toy: { ru: "Игрушка", en: "Toy" },
  cookie: { ru: "Печенье", en: "Cookies" },
  sandwich: { ru: "Сэндвич", en: "Sandwich" },
  cheese: { ru: "Сыр", en: "Cheese" },
  souvenir: { ru: "Сувенир", en: "Souvenir" },
  smoothie: { ru: "Смузи", en: "Smoothie" },
  honey: { ru: "Мёд", en: "Honey" }
};

const CUSTOMER_TEXT: Record<string, { ru: string; en: string; label?: { ru: string; en: string }; description?: { ru: string; en: string } }> = {
  child: { ru: "Ребёнок", en: "Child", label: { ru: "Любопытный выбор", en: "Curious choice" }, description: { ru: "Если лучший и второй по очкам товары почти равны, может купить товар со вторым результатом.", en: "If the top two scores are almost tied, may buy the second-highest product." } },
  student: { ru: "Студент", en: "Student", label: { ru: "Любит скидки", en: "Likes discounts" }, description: { ru: "Дешёвые товары получают +1 привлекательности.", en: "Budget products get +1 appeal." } },
  tourist: { ru: "Турист", en: "Tourist", label: { ru: "Верит афишам", en: "Trusts posters" }, description: { ru: "Покупает только при заметной поддержке тренда.", en: "Buys only with clear trend support." } },
  grandma: { ru: "Бабушка", en: "Grandma", label: { ru: "Присматривается", en: "Looks closely" }, description: { ru: "Если лучший и второй по очкам товары почти равны, может купить товар со вторым результатом.", en: "If the top two scores are almost tied, may buy the second-highest product." } },
  office_worker: { ru: "Офисник", en: "Office worker", label: { ru: "Берёт хиты дня", en: "Takes the hits" }, description: { ru: "Покупает только товары с трендовым бонусом.", en: "Buys only products with a trend bonus." } },
  athlete: { ru: "Спортсмен", en: "Athlete", label: { ru: "Следит за модой", en: "Follows trends" }, description: { ru: "Покупает только при сильном тренде.", en: "Buys only with a strong trend." } },
  family: { ru: "Семья", en: "Family", label: { ru: "Семейный бюджет", en: "Family budget" }, description: { ru: "Дешёвые товары получают +1 привлекательности.", en: "Budget products get +1 appeal." } },
  gourmet: { ru: "Гурман", en: "Gourmet", label: { ru: "Ищет рекомендацию", en: "Needs a recommendation" }, description: { ru: "Покупает только при сильном тренде.", en: "Buys only with a strong trend." } },
  driver: { ru: "Водитель", en: "Driver", label: { ru: "Берёт по акции", en: "Buys on promo" }, description: { ru: "Дешёвые товары получают +1 привлекательности.", en: "Budget products get +1 appeal." } },
  blogger: { ru: "Блогер", en: "Blogger", label: { ru: "Охотится за хайпом", en: "Hunts the hype" }, description: { ru: "Покупает только при сильном тренде.", en: "Buys only with a strong trend." } },
  schoolkid: { ru: "Школьник", en: "Schoolkid", label: { ru: "Копит сдачу", en: "Saves change" }, description: { ru: "Дешёвые товары получают +1 привлекательности.", en: "Budget products get +1 appeal." } },
  sweet_tooth: { ru: "Сладкоежка", en: "Sweet tooth", label: { ru: "Хочет сюрприз", en: "Wants a surprise" }, description: { ru: "Если лучший и второй по очкам товары почти равны, может купить товар со вторым результатом.", en: "If the top two scores are almost tied, may buy the second-highest product." } },
  farmer: { ru: "Фермер", en: "Farmer", label: { ru: "Сравнивает прилавки", en: "Compares stalls" }, description: { ru: "Если лучший и второй по очкам товары почти равны, может купить товар со вторым результатом.", en: "If the top two scores are almost tied, may buy the second-highest product." } },
  rich: { ru: "Богач", en: "Rich guest", label: { ru: "Покупает модное", en: "Buys fashionable goods" }, description: { ru: "Покупает только при трендовом бонусе.", en: "Buys only with a trend bonus." } },
  rushing: { ru: "Спешащий клиент", en: "Rushing customer", label: { ru: "Не любит переплаты", en: "Avoids overpaying" }, description: { ru: "Дешёвые товары получают +1 привлекательности.", en: "Budget products get +1 appeal." } },
  vacationer: { ru: "Отдыхающий", en: "Vacationer", label: { ru: "Выбирает настроение", en: "Chooses by mood" }, description: { ru: "Если лучший и второй по очкам товары почти равны, может купить товар со вторым результатом.", en: "If the top two scores are almost tied, may buy the second-highest product." } }
};

const TREND_TEXT: Record<string, { ru: string; en: string }> = {
  sweet_day: { ru: "Сладкий день", en: "Sweet Day" },
  coffee_morning: { ru: "Кофейное утро", en: "Coffee Morning" },
  discount_day: { ru: "Скидочный день", en: "Discount Day" },
  kids_day: { ru: "День детей", en: "Kids' Day" },
  tourist_season: { ru: "Туристический сезон", en: "Tourist Season" },
  fitness: { ru: "Фитнес-мода", en: "Fitness Craze" },
  rainy_day: { ru: "Дождливый день", en: "Rainy Day" },
  holiday: { ru: "Праздник", en: "Holiday" },
  farm_fair: { ru: "Фермерская ярмарка", en: "Farmers' Fair" },
  fast_lunch: { ru: "Быстрый обед", en: "Quick Lunch" },
  gift_boom: { ru: "Подарочный бум", en: "Gift Boom" },
  luxury_evening: { ru: "Роскошный вечер", en: "Luxury Evening" }
};

const INFLUENCE_TEXT: Record<string, { ru: string; en: string; description: { ru: string; en: string } }> = {
  drink_ads: { ru: "Реклама напитков", en: "Drink Ads", description: { ru: "напиток +1 в этом раунде", en: "drink +1 this round" } },
  kids_party: { ru: "Детский праздник", en: "Kids' Party", description: { ru: "детское +1 в этом раунде", en: "kids +1 this round" } },
  coupons: { ru: "Купоны", en: "Coupons", description: { ru: "дешёвое +1 в этом раунде", en: "budget +1 this round" } },
  local_blogger: { ru: "Местный блогер", en: "Local Blogger", description: { ru: "местное +1 в этом раунде", en: "local +1 this round" } },
  sweet_smell: { ru: "Сладкий запах", en: "Sweet Smell", description: { ru: "сладкое +1 в этом раунде", en: "sweet +1 this round" } },
  fresh_supply: { ru: "Свежая поставка", en: "Fresh Delivery", description: { ru: "свежее +1 в этом раунде", en: "fresh +1 this round" } },
  fast_service: { ru: "Быстрое обслуживание", en: "Fast Service", description: { ru: "быстрое +1 в этом раунде", en: "quick +1 this round" } },
  premium_pack: { ru: "Премиум-упаковка", en: "Premium Packaging", description: { ru: "дорогое +1 в этом раунде", en: "premium +1 this round" } },
  showcase: { ru: "Витрина", en: "Display Window", description: { ru: "один свой товар получает +2 привлекательности", en: "one of your products gets +2 appeal" } },
  rearrange: { ru: "Перестановка", en: "Rearrangement", description: { ru: "разрешает ещё одну замену товара до продажи", en: "allows one more product replacement before sales" } },
  bad_ads: { ru: "Антиреклама", en: "Bad Ads", description: { ru: "выбранный тег получает -1 для обоих игроков", en: "selected tag gets -1 for both players" } },
  neighbor_queue: { ru: "Очередь к соседу", en: "Neighbor's Queue", description: { ru: "один товар соперника получает -2 привлекательности", en: "one opponent product gets -2 appeal" } },
  sample: { ru: "Пробник", en: "Sample", description: { ru: "свой товар получает +1 и не теряет запас при продаже", en: "your product gets +1 and keeps stock when sold" } },
  urgent_supply: { ru: "Срочная закупка", en: "Urgent Supply", description: { ru: "добери 2 карты товаров, оставь 1", en: "draw 2 product cards, keep 1" } },
  marketing_move: { ru: "Маркетинговый ход", en: "Marketing Move", description: { ru: "добери 2 карты влияния, оставь 1", en: "draw 2 influence cards, keep 1" } }
};

const UPGRADE_TEXT: Record<string, { ru: string; en: string; description: { ru: string; en: string } }> = {
  extra_shelf: { ru: "Дополнительная полка", en: "Extra Shelf", description: { ru: "+1 слот товара", en: "+1 product slot" } },
  beautiful_window: { ru: "Красивая витрина", en: "Beautiful Window", description: { ru: "первый товар слева получает +1", en: "leftmost product gets +1" } },
  regular_customers: { ru: "Постоянные клиенты", en: "Regular Customers", description: { ru: "первый клиент раунда даёт +1 монету", en: "first customer of the round gives +1 coin" } },
  supplier: { ru: "Хороший поставщик", en: "Good Supplier", description: { ru: "новые товары получают +1 запас", en: "new products get +1 stock" } },
  bright_sign: { ru: "Яркая вывеска", en: "Bright Sign", description: { ru: "при равенстве клиент выбирает тебя", en: "customers choose you on ties" } },
  mini_storage: { ru: "Мини-склад", en: "Mini Storage", description: { ru: "+1 к лимиту карт товара; карта добирается в начале следующего раунда", en: "+1 product card limit; draw up at the start of the next round" } },
  ad_table: { ru: "Рекламный столик", en: "Ad Table", description: { ru: "раз за раунд дай своему товару +1", en: "once per round, give your product +1" } }
};

export function productName(language: Language, product: ProductInstance | { id: string; name: string; cardId?: string }) {
  const id = "cardId" in product && product.cardId ? product.cardId : "id" in product ? product.id : product.cardId;
  return PRODUCT_TEXT[id]?.[language] ?? product.name;
}

export function customerName(language: Language, customer: CustomerCard) {
  return CUSTOMER_TEXT[customer.id]?.[language] ?? customer.name;
}

export function customerPersonalityLabel(language: Language, customer: CustomerCard) {
  return customer.personality ? CUSTOMER_TEXT[customer.id]?.label?.[language] ?? customer.personality.label : "";
}

export function customerPersonalityDescription(language: Language, customer: CustomerCard) {
  const personality = customer.personality;
  if (!personality) {
    return "";
  }

  if (personality.kind === "bargain_hunter") {
    return language === "en"
      ? "+1 appeal for products tagged budget or priced 2 coins or less."
      : "+1: «дешёвое» или цена 2 и ниже.";
  }

  if (personality.kind === "trend_chaser") {
    return language === "en"
      ? `Only buys products with positive trend bonuses totaling ${personality.minTrendScore} or more. Wishes and influence do not count.`
      : `Нужен трендовый бонус ${personality.minTrendScore}+. Желания и влияние не считаются.`;
  }

  return language === "en"
    ? `May choose the second-highest scoring product when it is behind the best by ${personality.maxAppealGap} or less.`
    : `Может купить товар со вторым результатом, если он отстаёт от лучшего на ${personality.maxAppealGap} или меньше.`;
}

export function trendName(language: Language, trend: TrendCard | { id: string; name: string }) {
  return TREND_TEXT[trend.id]?.[language] ?? trend.name;
}

export function influenceName(language: Language, card: InfluenceCard | { id: string; name: string }) {
  return INFLUENCE_TEXT[card.id]?.[language] ?? card.name;
}

export function influenceDescription(language: Language, card: InfluenceCard) {
  return INFLUENCE_TEXT[card.id]?.description[language] ?? card.description;
}

export function upgradeName(language: Language, upgrade: UpgradeCard | { id: string; name: string }) {
  return UPGRADE_TEXT[upgrade.id]?.[language] ?? upgrade.name;
}

export function upgradeDescription(language: Language, upgrade: UpgradeCard) {
  return UPGRADE_TEXT[upgrade.id]?.description[language] ?? upgrade.description;
}

export function coinText(language: Language, amount?: number) {
  if (language === "en") {
    return amount === 1 ? "coin" : "coins";
  }
  return amount === undefined ? "мон." : "мон.";
}

export function translateKnownName(language: Language, name: string) {
  if (language === "ru") {
    return name;
  }

  for (const group of [PRODUCT_TEXT, CUSTOMER_TEXT, TREND_TEXT, INFLUENCE_TEXT, UPGRADE_TEXT]) {
    for (const value of Object.values(group)) {
      if (value.ru === name) {
        return value.en;
      }
    }
  }

  return name;
}

export function goalTitle(language: Language, goal: PartyGoalLike) {
  const tag = goal.tag ? tagText(language, goal.tag) : "";
  if (language === "ru") {
    if (goal.kind === "tag_sales" && goal.tag) return `Продайте 2 товара с тегом «${tag}»`;
    if (goal.kind === "tag_money" && goal.tag) return `Заработайте ${goal.target} монет на товарах с тегом «${tag}»`;
    if (goal.kind === "no_influence_sale") return "Получите 3 продажи, не сыграв свою карту влияния";
    if (goal.kind === "sale_streak") return "Сделайте 5 продаж за партию";
    if (goal.kind === "price_sale" && goal.maxPrice !== undefined) return "Продайте 3 товара ценой 2 монеты или меньше";
    if (goal.kind === "price_sale" && goal.minPrice !== undefined) return "Продайте 3 товара ценой 4 монеты или больше";
    return goal.title;
  }

  if (goal.kind === "tag_sales" && goal.tag) return `Sell 2 products tagged "${tag}"`;
  if (goal.kind === "tag_money" && goal.tag) return `Earn ${goal.target} coins from products tagged "${tag}"`;
  if (goal.kind === "no_influence_sale") return "Get 3 sales without playing your influence card";
  if (goal.kind === "sale_streak") return "Make 5 sales in one party";
  if (goal.kind === "price_sale" && goal.maxPrice !== undefined) return "Sell 3 products priced 2 coins or less";
  if (goal.kind === "price_sale" && goal.minPrice !== undefined) return "Sell 3 products priced 4 coins or more";
  return goal.title;
}
