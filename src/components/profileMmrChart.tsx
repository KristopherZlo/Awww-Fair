import type { RankedMatchHistoryEntry } from "../app/rankedClient";

export type ProfileMmrResult = "start" | "win" | "loss" | "draw";

export interface ProfileMmrPoint {
  key: string;
  mmr: number;
  result: ProfileMmrResult;
}

interface ProfileMmrChartProps {
  history: RankedMatchHistoryEntry[];
  playerId: string;
  isCalibrating: boolean;
}

function playerRating(match: RankedMatchHistoryEntry, playerId: string, moment: "before" | "after") {
  if (match.playerAId === playerId) {
    return moment === "before" ? match.playerAMmrBefore : match.playerAMmrAfter;
  }
  if (match.playerBId === playerId) {
    return moment === "before" ? match.playerBMmrBefore : match.playerBMmrAfter;
  }
  return null;
}

function playerResult(match: RankedMatchHistoryEntry, playerId: string): Exclude<ProfileMmrResult, "start"> {
  if (!match.winnerId) return "draw";
  return match.winnerId === playerId ? "win" : "loss";
}

export function buildProfileMmrSeries(history: RankedMatchHistoryEntry[], playerId: string): ProfileMmrPoint[] {
  const matches = history
    .filter((match) => !match.isCalibration && (match.playerAId === playerId || match.playerBId === playerId))
    .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())
    .slice(-20);

  if (!matches.length) return [];

  const initialRating = playerRating(matches[0], playerId, "before");
  if (initialRating === null) return [];

  return [
    { key: `start-${matches[0].matchId}`, mmr: initialRating, result: "start" },
    ...matches.flatMap((match) => {
      const rating = playerRating(match, playerId, "after");
      return rating === null ? [] : [{ key: match.matchId, mmr: rating, result: playerResult(match, playerId) }];
    })
  ];
}

export function ProfileMmrChart({ history, playerId, isCalibrating }: ProfileMmrChartProps) {
  const series = isCalibrating ? [] : buildProfileMmrSeries(history, playerId);
  if (!series.length) return null;

  const width = 640;
  const height = 220;
  const padding = { top: 18, right: 18, bottom: 18, left: 48 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const values = series.map((point) => point.mmr);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const margin = Math.max(8, Math.ceil((maximum - minimum) * 0.15));
  const lowerBound = minimum - margin;
  const upperBound = maximum + margin;
  const range = Math.max(1, upperBound - lowerBound);
  const coordinates = series.map((point, index) => ({
    ...point,
    x: padding.left + (series.length === 1 ? chartWidth / 2 : (index / (series.length - 1)) * chartWidth),
    y: padding.top + ((upperBound - point.mmr) / range) * chartHeight
  }));
  const gridValues = [upperBound, Math.round((upperBound + lowerBound) / 2), lowerBound];

  return (
    <svg className="profile-mmr-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="MMR">
      {gridValues.map((value) => {
        const y = padding.top + ((upperBound - value) / range) * chartHeight;
        return (
          <g className="profile-mmr-grid-line" key={value}>
            <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} />
            <text x={padding.left - 8} y={y + 4}>
              {value}
            </text>
          </g>
        );
      })}
      <polyline
        className="profile-mmr-line"
        points={coordinates.map((point) => `${point.x},${point.y}`).join(" ")}
      />
      {coordinates.map((point, index) => (
        <circle
          className={`profile-mmr-point is-${point.result}`}
          cx={point.x}
          cy={point.y}
          data-mmr={point.mmr}
          key={point.key}
          r={index === coordinates.length - 1 ? 5 : 4}
        >
          <title>{`${point.mmr} MMR`}</title>
        </circle>
      ))}
    </svg>
  );
}
