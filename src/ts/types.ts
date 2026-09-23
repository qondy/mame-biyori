export type FoodKey = 'natto' | 'tofu' | 'edamame';

export type FoodCounts = Record<FoodKey, number>;

/** users/{uid}/days/{YYYY-MM-DD} */
export interface DayLog {
  date: string;
  counts: FoodCounts;
  /** アレンジID → その日に食べた回数 */
  recipes: Record<string, number>;
}

export interface Recipe {
  id: string;
  food: FoodKey;
  title: string;
  note: string;
  builtin: boolean;
}
