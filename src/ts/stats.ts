import { addDays } from './dates';
import { FOODS, FOOD_KEYS } from './foods';
import { DayLog, FoodCounts } from './types';

export const emptyCounts = (): FoodCounts => ({ natto: 0, tofu: 0, edamame: 0 });

export const totalOf = (c: FoodCounts): number => c.natto + c.tofu + c.edamame;

/** 納豆・豆腐・枝豆のどれか1つでも食べた日を「達成」とする */
export const isAchieved = (c: FoodCounts): boolean => totalOf(c) > 0;

export function proteinOf(c: FoodCounts): number {
  return FOODS.reduce((sum, f) => sum + f.protein * c[f.key], 0);
}

export function countsOn(days: Map<string, DayLog>, key: string): FoodCounts {
  return days.get(key)?.counts ?? emptyCounts();
}

/**
 * 連続日数。今日が未記録なら昨日から数える（今日まだ食べていなくても連続が途切れて見えないように）。
 */
export function streak(days: Map<string, DayLog>, today: string, pred: (c: FoodCounts) => boolean): number {
  let cursor = pred(countsOn(days, today)) ? today : addDays(today, -1);
  let n = 0;
  while (pred(countsOn(days, cursor))) {
    n++;
    cursor = addDays(cursor, -1);
  }
  return n;
}

export interface MonthSummary {
  counts: FoodCounts;
  achievedDays: number;
  protein: number;
  recipeRanking: { id: string; count: number }[];
}

export function summarizeMonth(days: Map<string, DayLog>, monthPrefix: string): MonthSummary {
  const counts = emptyCounts();
  const recipeTotals = new Map<string, number>();
  let achievedDays = 0;
  days.forEach((log, key) => {
    if (!key.startsWith(`${monthPrefix}-`)) return;
    FOOD_KEYS.forEach((k) => { counts[k] += log.counts[k]; });
    if (isAchieved(log.counts)) achievedDays++;
    Object.entries(log.recipes).forEach(([id, n]) => {
      recipeTotals.set(id, (recipeTotals.get(id) ?? 0) + n);
    });
  });
  const recipeRanking = Array.from(recipeTotals, ([id, count]) => ({ id, count }))
    .sort((a, b) => b.count - a.count);
  return { counts, achievedDays, protein: proteinOf(counts), recipeRanking };
}
