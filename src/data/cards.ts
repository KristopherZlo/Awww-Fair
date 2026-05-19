import type { CustomerCard, InfluenceCard, ProductCard, Tag, TrendCard, UpgradeCard } from "../game/types";

export const TAGS: Tag[] = [
  "сладкое",
  "напиток",
  "дешёвое",
  "дорогое",
  "свежее",
  "быстрое",
  "детское",
  "местное"
];

export const TAG_COLORS: Record<Tag, string> = {
  сладкое: "#f7a8bd",
  напиток: "#8ecae6",
  дешёвое: "#e8c86a",
  дорогое: "#d7a7f5",
  свежее: "#9fd69a",
  быстрое: "#f6b26b",
  детское: "#a7c7ff",
  местное: "#b69b77"
};

export const PRODUCT_CARDS: ProductCard[] = [
  { id: "bread", name: "Хлеб", type: "product", tags: ["дешёвое", "быстрое"], price: 2, stock: 2, sprite: { col: 0, row: 0 } },
  { id: "coffee", name: "Кофе", type: "product", tags: ["напиток", "быстрое"], price: 3, stock: 2, sprite: { col: 1, row: 0 } },
  { id: "cake", name: "Торт", type: "product", tags: ["сладкое", "дорогое"], price: 4, stock: 2, sprite: { col: 2, row: 0 } },
  { id: "berries", name: "Ягоды", type: "product", tags: ["свежее", "сладкое"], price: 3, stock: 2, sprite: { col: 3, row: 0 } },
  { id: "lemonade", name: "Лимонад", type: "product", tags: ["напиток", "свежее"], price: 3, stock: 2, sprite: { col: 0, row: 1 } },
  { id: "toy", name: "Игрушка", type: "product", tags: ["детское", "дорогое"], price: 5, stock: 1, sprite: { col: 1, row: 1 } },
  { id: "cookie", name: "Печенье", type: "product", tags: ["детское", "дешёвое"], price: 2, stock: 2, sprite: { col: 2, row: 1 } },
  { id: "sandwich", name: "Сэндвич", type: "product", tags: ["дешёвое", "быстрое"], price: 3, stock: 2, sprite: { col: 3, row: 1 } },
  { id: "cheese", name: "Сыр", type: "product", tags: ["местное", "свежее"], price: 4, stock: 2, sprite: { col: 0, row: 2 } },
  { id: "souvenir", name: "Сувенир", type: "product", tags: ["местное", "дорогое"], price: 5, stock: 1, sprite: { col: 1, row: 2 } },
  { id: "smoothie", name: "Смузи", type: "product", tags: ["напиток", "детское"], price: 4, stock: 2, sprite: { col: 2, row: 2 } },
  { id: "honey", name: "Мёд", type: "product", tags: ["местное", "сладкое"], price: 4, stock: 3, sprite: { col: 3, row: 2 } }
];

export const CUSTOMER_CARDS: CustomerCard[] = [
  { id: "child", name: "Ребёнок", type: "customer", primaryTag: "детское", secondaryTag: "сладкое", sprite: { col: 0, row: 0 } },
  { id: "student", name: "Студент", type: "customer", primaryTag: "дешёвое", secondaryTag: "быстрое", sprite: { col: 1, row: 0 } },
  { id: "tourist", name: "Турист", type: "customer", primaryTag: "местное", secondaryTag: "дорогое", sprite: { col: 2, row: 0 } },
  { id: "grandma", name: "Бабушка", type: "customer", primaryTag: "свежее", secondaryTag: "сладкое", sprite: { col: 3, row: 0 } },
  { id: "office_worker", name: "Офисник", type: "customer", primaryTag: "напиток", secondaryTag: "быстрое", sprite: { col: 0, row: 1 } },
  { id: "athlete", name: "Спортсмен", type: "customer", primaryTag: "свежее", secondaryTag: "напиток", sprite: { col: 1, row: 1 } },
  { id: "family", name: "Семья", type: "customer", primaryTag: "детское", secondaryTag: "дешёвое", sprite: { col: 2, row: 1 } },
  { id: "gourmet", name: "Гурман", type: "customer", primaryTag: "дорогое", secondaryTag: "свежее", sprite: { col: 3, row: 1 } },
  { id: "driver", name: "Водитель", type: "customer", primaryTag: "быстрое", secondaryTag: "напиток", sprite: { col: 0, row: 2 } },
  { id: "blogger", name: "Блогер", type: "customer", primaryTag: "местное", secondaryTag: "дорогое", sprite: { col: 1, row: 2 } },
  { id: "schoolkid", name: "Школьник", type: "customer", primaryTag: "детское", secondaryTag: "дешёвое", sprite: { col: 2, row: 2 } },
  { id: "sweet_tooth", name: "Сладкоежка", type: "customer", primaryTag: "сладкое", secondaryTag: "дешёвое", sprite: { col: 3, row: 2 } },
  { id: "farmer", name: "Фермер", type: "customer", primaryTag: "местное", secondaryTag: "свежее", sprite: { col: 0, row: 3 } },
  { id: "rich", name: "Богач", type: "customer", primaryTag: "дорогое", secondaryTag: "сладкое", sprite: { col: 1, row: 3 } },
  { id: "rushing", name: "Спешащий клиент", type: "customer", primaryTag: "быстрое", secondaryTag: "дешёвое", sprite: { col: 2, row: 3 } },
  { id: "vacationer", name: "Отдыхающий", type: "customer", primaryTag: "напиток", secondaryTag: "сладкое", sprite: { col: 3, row: 3 } }
];

export const TREND_CARDS: TrendCard[] = [
  { id: "sweet_day", name: "Сладкий день", type: "trend", modifiers: [{ tag: "сладкое", value: 1 }] },
  { id: "coffee_morning", name: "Кофейное утро", type: "trend", modifiers: [{ tag: "напиток", value: 1 }, { tag: "быстрое", value: 1 }] },
  { id: "discount_day", name: "Скидочный день", type: "trend", modifiers: [{ tag: "дешёвое", value: 2 }, { tag: "дорогое", value: -1 }] },
  { id: "kids_day", name: "День детей", type: "trend", modifiers: [{ tag: "детское", value: 2 }] },
  { id: "tourist_season", name: "Туристический сезон", type: "trend", modifiers: [{ tag: "местное", value: 1 }, { tag: "дорогое", value: 1 }] },
  { id: "fitness", name: "Фитнес-мода", type: "trend", modifiers: [{ tag: "свежее", value: 2 }, { tag: "сладкое", value: -1 }] },
  { id: "rainy_day", name: "Дождливый день", type: "trend", modifiers: [{ tag: "напиток", value: 1 }, { tag: "быстрое", value: 1 }] },
  { id: "holiday", name: "Праздник", type: "trend", modifiers: [{ tag: "сладкое", value: 1 }, { tag: "дорогое", value: 1 }] },
  { id: "farm_fair", name: "Фермерская ярмарка", type: "trend", modifiers: [{ tag: "местное", value: 1 }, { tag: "свежее", value: 1 }] },
  { id: "fast_lunch", name: "Быстрый обед", type: "trend", modifiers: [{ tag: "быстрое", value: 2 }] },
  { id: "gift_boom", name: "Подарочный бум", type: "trend", modifiers: [{ tag: "детское", value: 1 }, { tag: "дорогое", value: 1 }] },
  { id: "luxury_evening", name: "Роскошный вечер", type: "trend", modifiers: [{ tag: "дорогое", value: 2 }, { tag: "дешёвое", value: -1 }] }
];

export const INFLUENCE_CARDS: InfluenceCard[] = [
  { id: "drink_ads", name: "Реклама напитков", type: "influence", description: "напиток +1 в этом раунде", effect: { kind: "tag_modifier", modifiers: [{ tag: "напиток", value: 1 }] } },
  { id: "kids_party", name: "Детский праздник", type: "influence", description: "детское +1 в этом раунде", effect: { kind: "tag_modifier", modifiers: [{ tag: "детское", value: 1 }] } },
  { id: "coupons", name: "Купоны", type: "influence", description: "дешёвое +1 в этом раунде", effect: { kind: "tag_modifier", modifiers: [{ tag: "дешёвое", value: 1 }] } },
  { id: "local_blogger", name: "Местный блогер", type: "influence", description: "местное +1 в этом раунде", effect: { kind: "tag_modifier", modifiers: [{ tag: "местное", value: 1 }] } },
  { id: "sweet_smell", name: "Сладкий запах", type: "influence", description: "сладкое +1 в этом раунде", effect: { kind: "tag_modifier", modifiers: [{ tag: "сладкое", value: 1 }] } },
  { id: "fresh_supply", name: "Свежая поставка", type: "influence", description: "свежее +1 в этом раунде", effect: { kind: "tag_modifier", modifiers: [{ tag: "свежее", value: 1 }] } },
  { id: "fast_service", name: "Быстрое обслуживание", type: "influence", description: "быстрое +1 в этом раунде", effect: { kind: "tag_modifier", modifiers: [{ tag: "быстрое", value: 1 }] } },
  { id: "premium_pack", name: "Премиум-упаковка", type: "influence", description: "дорогое +1 в этом раунде", effect: { kind: "tag_modifier", modifiers: [{ tag: "дорогое", value: 1 }] } },
  { id: "showcase", name: "Витрина", type: "influence", description: "один свой товар получает +2 привлекательности", effect: { kind: "target_own_bonus", value: 2 } },
  { id: "rearrange", name: "Перестановка", type: "influence", description: "разрешает ещё одну замену товара до продажи", effect: { kind: "rearrange" } },
  { id: "bad_ads", name: "Антиреклама", type: "influence", description: "выбранный тег получает -1 для обоих игроков", effect: { kind: "anti_tag", value: -1 } },
  { id: "neighbor_queue", name: "Очередь к соседу", type: "influence", description: "один товар соперника получает -2 привлекательности", effect: { kind: "target_opponent_penalty", value: -2 } },
  { id: "sample", name: "Пробник", type: "influence", description: "свой товар получает +1 и не теряет запас при продаже", effect: { kind: "target_own_bonus", value: 1, preserveStock: true } },
  { id: "urgent_supply", name: "Срочная закупка", type: "influence", description: "добери 2 карты товаров, оставь 1", effect: { kind: "draw_product", draw: 2, keep: 1 } },
  { id: "marketing_move", name: "Маркетинговый ход", type: "influence", description: "добери 2 карты влияния, оставь 1", effect: { kind: "draw_influence", draw: 2, keep: 1 } }
];

export const UPGRADE_CARDS: UpgradeCard[] = [
  { id: "extra_shelf", name: "Дополнительная полка", type: "upgrade", cost: 9, description: "+1 слот товара", effect: "extra_shelf" },
  { id: "beautiful_window", name: "Красивая витрина", type: "upgrade", cost: 4, description: "первый товар слева получает +1", effect: "beautiful_window" },
  { id: "regular_customers", name: "Постоянные клиенты", type: "upgrade", cost: 4, description: "первый клиент раунда даёт +1 монету", effect: "regular_customers" },
  { id: "supplier", name: "Хороший поставщик", type: "upgrade", cost: 8, description: "новые товары получают +1 запас", effect: "supplier" },
  { id: "bright_sign", name: "Яркая вывеска", type: "upgrade", cost: 3, description: "при равенстве клиент выбирает тебя", effect: "bright_sign" },
  { id: "mini_storage", name: "Мини-склад", type: "upgrade", cost: 5, description: "+1 карта товара в руке", effect: "mini_storage" },
  { id: "ad_table", name: "Рекламный столик", type: "upgrade", cost: 6, description: "раз за раунд дай своему товару +1", effect: "ad_table" }
];
