import { PackagePlus, ScrollText, Sparkles } from "lucide-react";
import { useId, type CSSProperties } from "react";
import { appAssetUrl } from "../assetUrl";
import { localHintMove, localHintValue } from "../app/localHints";
import { TAG_COLORS } from "../data/cards";
import { trendModifierValue } from "../game/engine";
import type {
  CustomerCard as CustomerCardType,
  InfluenceCard as InfluenceCardType,
  ProductInstance,
  Tag,
  TrendCard as TrendCardType,
  UpgradeCard as UpgradeCardType
} from "../game/types";
import {
  coinText,
  customerName,
  customerPersonalityDescription,
  customerPersonalityLabel,
  influenceDescription,
  influenceName,
  tagText,
  trendName,
  ui,
  upgradeDescription,
  upgradeName,
  type Language,
  productName
} from "../i18n";

const assetUrl = appAssetUrl;
const PRODUCT_ATLAS = assetUrl("product-atlas.webp");
const CUSTOMER_ATLAS = assetUrl("customer-atlas-128.webp");
const CUSTOMER_ATLAS_2X = assetUrl("customer-atlas-256.webp");

function formatTrendModifiers(modifiers: { tag: Tag; value: number }[], language: Language, focused = false) {
  return modifiers
    .map((modifier) => {
      const value = trendModifierValue(modifier.value, focused);
      return `${tagText(language, modifier.tag)} ${value > 0 ? "+" : ""}${value}`;
    })
    .join(", ");
}

function Sprite({
  atlas,
  cols,
  rows,
  col,
  row,
  atlas2x,
  className = ""
}: {
  atlas: string;
  cols: number;
  rows: number;
  col: number;
  row: number;
  atlas2x?: string;
  className?: string;
}) {
  const x = cols === 1 ? 0 : (col / (cols - 1)) * 100;
  const y = rows === 1 ? 0 : (row / (rows - 1)) * 100;
  const spriteAtlas = atlas2x ? `image-set(url("${atlas}") 1x, url("${atlas2x}") 2x)` : `url("${atlas}")`;
  return (
    <span
      className={`sprite ${className}`}
      style={{
        "--sprite-atlas": spriteAtlas,
        backgroundSize: `${cols * 100}% ${rows * 100}%`,
        backgroundPosition: `${x}% ${y}%`
      } as CSSProperties}
    />
  );
}

export function TagPill({ tag, language, matched }: { tag: Tag; language: Language; matched?: boolean }) {
  return (
    <span
      className={`tag ${matched ? "matched" : ""}`}
      style={{ "--tag-color": TAG_COLORS[tag] } as CSSProperties}
    >
      {tagText(language, tag)}
    </span>
  );
}

export function ProductCard({
  product,
  compact = false,
  selected = false,
  recommended = false,
  correctMove = false,
  disabled = false,
  ariaDisabled = false,
  onClick,
  title,
  focusTags,
  language
}: {
  product: ProductInstance;
  compact?: boolean;
  selected?: boolean;
  recommended?: boolean;
  correctMove?: boolean;
  disabled?: boolean;
  ariaDisabled?: boolean;
  onClick?: () => void;
  title?: string;
  focusTags?: Set<Tag>;
  language: Language;
}) {
  const label = productName(language, product);
  return (
    <button
      className={`card product-card ${compact ? "compact" : ""} ${selected ? "selected" : ""} ${recommended ? "coach-recommended" : ""}`}
      disabled={disabled}
      aria-disabled={ariaDisabled || disabled || undefined}
      data-correct-product-id={localHintValue(product.instanceId)}
      data-correct-card-id={localHintValue(product.cardId)}
      data-correct-move={localHintMove(correctMove)}
      onClick={onClick}
      title={title}
    >
      <Sprite atlas={PRODUCT_ATLAS} cols={4} rows={3} col={product.sprite.col} row={product.sprite.row} className="product-sprite" />
      <span className="product-copy card-copy">
        <strong>{label}</strong>
        <span className="tag-row">
          {product.tags.map((tag) => (
            <TagPill key={tag} tag={tag} language={language} matched={focusTags?.has(tag)} />
          ))}
        </span>
        <span className="card-meta">
          <span>{product.price} {coinText(language, product.price)}</span>
          <span>{language === "en" ? "stock" : "запас"} {product.stock}</span>
        </span>
      </span>
    </button>
  );
}

export function CustomerCard({ customer, focusTags, language }: { customer: CustomerCardType; focusTags?: Set<Tag>; language: Language }) {
  const label = customerName(language, customer);
  const personalityLabel = customerPersonalityLabel(language, customer);
  const personalityDescription = customerPersonalityDescription(language, customer);
  const tooltipBaseId = useId();
  const tooltipId = `${tooltipBaseId}-${customer.id}-personality`;
  return (
    <div
      className="card customer-card"
      aria-label={
        language === "en"
          ? `${label}: primary ${tagText(language, customer.primaryTag)}, secondary ${tagText(language, customer.secondaryTag)}${customer.personality ? `. Personality: ${personalityDescription}` : ""}`
          : `${label}: главное ${tagText(language, customer.primaryTag)}, второе ${tagText(language, customer.secondaryTag)}${customer.personality ? `. Характер: ${personalityDescription}` : ""}`
      }
    >
      <Sprite atlas={CUSTOMER_ATLAS} atlas2x={CUSTOMER_ATLAS_2X} cols={4} rows={4} col={customer.sprite.col} row={customer.sprite.row} className="customer-sprite" />
      <div className="customer-copy card-copy">
        <strong>{label}</strong>
        {customer.personality && (
          <span className="personality-line">
            <span className="personality-badge" tabIndex={0} aria-describedby={tooltipId}>
              {personalityLabel}
            </span>
            <span id={tooltipId} className="personality-tooltip" role="tooltip">
              {personalityDescription}
            </span>
          </span>
        )}
        <div className="tag-row">
          <TagPill tag={customer.primaryTag} language={language} matched />
          <TagPill tag={customer.secondaryTag} language={language} matched={focusTags?.has(customer.secondaryTag)} />
        </div>
      </div>
    </div>
  );
}

export function TrendCard({ trend, focused = false, language }: { trend: TrendCardType; focused?: boolean; language: Language }) {
  const label = trendName(language, trend);
  const modifiers = formatTrendModifiers(trend.modifiers, language, focused);
  return (
    <div className={`trend-card ${focused ? "focus-trend" : ""}`} title={`${label}: ${modifiers}`}>
      <Sparkles size={18} />
      <div className="trend-copy">
        {focused && <em>{ui(language, "focusTrend")}</em>}
        <strong>{label}</strong>
        <span>{modifiers}</span>
      </div>
    </div>
  );
}

export function InfluenceCard({
  card,
  selected,
  recommended = false,
  correctMove = false,
  disabled,
  onClick,
  language
}: {
  card: InfluenceCardType;
  selected: boolean;
  recommended?: boolean;
  correctMove?: boolean;
  disabled: boolean;
  onClick: () => void;
  language: Language;
}) {
  const label = influenceName(language, card);
  const description = influenceDescription(language, card);
  return (
    <button
      className={`card influence-card ${selected ? "selected" : ""} ${recommended ? "coach-recommended" : ""}`}
      disabled={disabled}
      data-correct-influence-id={localHintValue(card.id)}
      data-correct-move={localHintMove(correctMove)}
      onClick={onClick}
      title={description}
    >
      <ScrollText size={20} />
      <span className="influence-copy card-copy">
        <strong>{label}</strong>
        <span>{description}</span>
      </span>
    </button>
  );
}

export function UpgradeCard({
  upgrade,
  canBuy,
  correctMove = false,
  onBuy,
  language
}: {
  upgrade: UpgradeCardType;
  canBuy: boolean;
  correctMove?: boolean;
  onBuy: () => void;
  language: Language;
}) {
  const label = upgradeName(language, upgrade);
  const description = upgradeDescription(language, upgrade);
  return (
    <button
      className="card upgrade-card"
      disabled={!canBuy}
      data-correct-upgrade-id={localHintValue(upgrade.id)}
      data-correct-move={localHintMove(correctMove)}
      onClick={onBuy}
      title={description}
    >
      <PackagePlus size={22} />
      <strong>{label}</strong>
      <span>{description}</span>
      <b>{upgrade.cost} {coinText(language, upgrade.cost)}</b>
    </button>
  );
}
