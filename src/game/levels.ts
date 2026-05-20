import type { CustomerCard } from "./types";

export interface CampaignLevel {
  level: number;
  title: string;
  district: string;
  opponentName: string;
  opponentNameEn: string;
  opponentSpecies: string;
  aiDifficulty: number;
  story: string;
}

export interface CampaignProgress {
  highestUnlockedLevel: number;
  completedLevels: number[];
}

export type CampaignCustomerPersonalityMode = "off" | "simple" | "all";

export interface CampaignLevelRules {
  trendCount: number;
  partyGoalCount: number;
  influenceHandSize: number;
  purchaseAppealThreshold: number;
  customerPersonalityMode: CampaignCustomerPersonalityMode;
}

export interface CampaignRulesOptions {
  customerPersonalitiesEnabled?: boolean;
}

export const CAMPAIGN_LEVELS: CampaignLevel[] = [
  { level: 1, title: "Первые пирожные", district: "Ворота ярмарки", opponentName: "Биби", opponentNameEn: "Bibi", opponentSpecies: "мышонок", aiDifficulty: 1, story: "В мире Ааах ярмарка только началась." },
  { level: 2, title: "Сладкий ряд", district: "Пекарская улица", opponentName: "Лулу", opponentNameEn: "Lulu", opponentSpecies: "котёнок", aiDifficulty: 2, story: "Наша лавка становится всё популярнее." },
  { level: 3, title: "Кофейный звон", district: "Утренний навес", opponentName: "Мими", opponentNameEn: "Mimi", opponentSpecies: "бельчонок", aiDifficulty: 3, story: "Соседи по рынку уже смотрят на нас с завистью." },
  { level: 4, title: "Игрушечная очередь", district: "Детская аллея", opponentName: "Тото", opponentNameEn: "Toto", opponentSpecies: "щенок", aiDifficulty: 4, story: "Ещё один удачный день - и мечта станет ближе." },
  { level: 5, title: "Лимонадный шум", district: "Солнечная площадь", opponentName: "Луми", opponentNameEn: "Lumi", opponentSpecies: "утёнок", aiDifficulty: 5, story: "До новой шляпы осталось совсем немного." },
  { level: 6, title: "Ягодный час", district: "Садовый проход", opponentName: "Нори", opponentNameEn: "Nori", opponentSpecies: "ежонок", aiDifficulty: 6, story: "Финал первого ярмарочного дня уже рядом." },
  { level: 7, title: "Сырный поворот", district: "Фермерский круг", opponentName: "Коко", opponentNameEn: "Koko", opponentSpecies: "козлёнок", aiDifficulty: 7, story: "Новые покупатели ищут самые свежие товары." },
  { level: 8, title: "Быстрый обед", district: "Обеденный мостик", opponentName: "Руми", opponentNameEn: "Rumi", opponentSpecies: "енотик", aiDifficulty: 8, story: "Покупатели спешат, и каждая витрина на счету." },
  { level: 9, title: "Подарочный бум", district: "Праздничный двор", opponentName: "Фифи", opponentNameEn: "Fifi", opponentSpecies: "лисенок", aiDifficulty: 9, story: "В мире Ааах начинают говорить о нашей лавке." },
  { level: 10, title: "Медовая витрина", district: "Пчелиный угол", opponentName: "Боня", opponentNameEn: "Bonya", opponentSpecies: "медвежонок", aiDifficulty: 10, story: "Копилка для новой шляпы звенит всё чаще." },
  { level: 11, title: "Туристический поток", district: "Переулок сувениров", opponentName: "Сана", opponentNameEn: "Sana", opponentSpecies: "панда", aiDifficulty: 11, story: "Гости ярмарки ищут что-то особенное." },
  { level: 12, title: "Вечерняя упаковка", district: "Огни фонариков", opponentName: "Яша", opponentNameEn: "Yasha", opponentSpecies: "хомячок", aiDifficulty: 12, story: "Соперники начинают играть аккуратнее." },
  { level: 13, title: "День скидок", district: "Монетная площадь", opponentName: "Тика", opponentNameEn: "Tika", opponentSpecies: "зайчонок", aiDifficulty: 13, story: "Теперь важно считать каждую монету." },
  { level: 14, title: "Большие вывески", district: "Ряд мастеров", opponentName: "Мока", opponentNameEn: "Moka", opponentSpecies: "оленёнок", aiDifficulty: 14, story: "Яркие вывески переманивают покупателей." },
  { level: 15, title: "Свежая поставка", district: "Зелёный рынок", opponentName: "Лина", opponentNameEn: "Lina", opponentSpecies: "овечка", aiDifficulty: 15, story: "Хорошие товары заканчиваются быстрее обычного." },
  { level: 16, title: "Очередь у соседей", district: "Шумный перекрёсток", opponentName: "Пако", opponentNameEn: "Pako", opponentSpecies: "пингвинёнок", aiDifficulty: 16, story: "Соседи всё чаще подглядывают за нашими ценами." },
  { level: 17, title: "Модный прилавок", district: "Площадка блогеров", opponentName: "Сима", opponentNameEn: "Sima", opponentSpecies: "рысенок", aiDifficulty: 17, story: "Модные покупатели требуют точного попадания в тренд." },
  { level: 18, title: "Почти чемпион", district: "Средний купол", opponentName: "Додо", opponentNameEn: "Dodo", opponentSpecies: "птичка", aiDifficulty: 18, story: "До новой шляпы осталось совсем немного." },
  { level: 19, title: "Золотой проход", district: "Роскошная аллея", opponentName: "Ника", opponentNameEn: "Nika", opponentSpecies: "белочка", aiDifficulty: 19, story: "Богатые гости ждут дорогих и красивых товаров." },
  { level: 20, title: "Громкий финал", district: "Главная сцена", opponentName: "Олли", opponentNameEn: "Ollie", opponentSpecies: "выдрёнок", aiDifficulty: 20, story: "Финал ярмарки уже рядом." },
  { level: 21, title: "Шляпный намёк", district: "Улица модистов", opponentName: "Виви", opponentNameEn: "Vivi", opponentSpecies: "кролик", aiDifficulty: 21, story: "В витрине магазина шляп уже видно нашу мечту." },
  { level: 22, title: "Последние монеты", district: "Кассовый дворик", opponentName: "Роро", opponentNameEn: "Roro", opponentSpecies: "морская свинка", aiDifficulty: 22, story: "Каждый клиент может решить судьбу покупки." },
  { level: 23, title: "Главный соперник", district: "Большой шатёр", opponentName: "Кира", opponentNameEn: "Kira", opponentSpecies: "лиса", aiDifficulty: 23, story: "Лучшие продавцы мира Ааах собрались у главного шатра." },
  { level: 24, title: "Новая шляпа", district: "Шляпная лавка", opponentName: "Йода", opponentNameEn: "Yoda", opponentSpecies: "кролик", aiDifficulty: 24, story: "Последняя победа отделяет нас от красивой новой шляпы." }
];

export function createDefaultCampaignProgress(): CampaignProgress {
  return {
    highestUnlockedLevel: 1,
    completedLevels: []
  };
}

export function isLevelUnlocked(progress: CampaignProgress, level: number) {
  return level <= progress.highestUnlockedLevel;
}

export function campaignProgressAfterWin(progress: CampaignProgress, level: number): CampaignProgress {
  const completedLevels = Array.from(new Set([...progress.completedLevels, level])).sort((left, right) => left - right);
  const highestUnlockedLevel = Math.min(CAMPAIGN_LEVELS.length, Math.max(progress.highestUnlockedLevel, level + 1));

  return {
    highestUnlockedLevel,
    completedLevels
  };
}

export function campaignRulesForLevel(level: number, options: CampaignRulesOptions = {}): CampaignLevelRules {
  const campaignLevel = Math.max(1, Math.min(CAMPAIGN_LEVELS.length, Math.round(level)));
  const customerPersonalityMode: CampaignCustomerPersonalityMode = options.customerPersonalitiesEnabled
    ? campaignLevel === 1
      ? "off"
      : campaignLevel < 8
        ? "simple"
        : "all"
    : "off";

  return {
    trendCount: campaignLevel >= 7 ? 3 : campaignLevel >= 5 ? 2 : campaignLevel >= 3 ? 1 : 0,
    partyGoalCount: campaignLevel >= 8 ? 3 : campaignLevel >= 6 ? 2 : campaignLevel >= 4 ? 1 : 0,
    influenceHandSize: campaignLevel >= 9 ? 2 : campaignLevel >= 7 ? 1 : 0,
    purchaseAppealThreshold: campaignLevel <= 2 ? 3 : campaignLevel <= 4 ? 4 : 5,
    customerPersonalityMode
  };
}

export function campaignCustomerForRules(customer: CustomerCard, rules: CampaignLevelRules): CustomerCard {
  if (rules.customerPersonalityMode === "all") {
    return customer;
  }

  if (rules.customerPersonalityMode === "simple" && customer.personality?.kind !== "trend_chaser") {
    return customer;
  }

  const { personality: _personality, ...customerWithoutPersonality } = customer;
  return customerWithoutPersonality;
}
