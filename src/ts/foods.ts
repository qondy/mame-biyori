import { FoodKey, Recipe } from './types';

export interface FoodDef {
  key: FoodKey;
  label: string;
  /** 1回分の目安 */
  unit: string;
  /** 1回分のたんぱく質(g)の目安（日本食品標準成分表の値をもとに概算） */
  protein: number;
  icon: string;
}

const svg = (body: string, size = 40): string =>
  `<svg width="${size}" height="${size}" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

const NATTO_BODY = '<path d="M10 32 H54 A22 20 0 0 1 10 32 Z"/><path d="M40 8 L50 30"/><path d="M47 6 L54 26"/><path d="M20 32 Q22 24 26 28 Q30 32 32 24"/>';
const TOFU_BODY = '<path d="M32 12 L52 22 V42 L32 52 L12 42 V22 Z"/><path d="M12 22 L32 32 L52 22"/><path d="M32 32 V52"/>';
export const POD_BODY = '<g transform="rotate(-18 32 32)"><path d="M9 33 A9 9 0 0 1 24 26.3 A9 9 0 0 1 36 26.3 A9 9 0 0 1 51 33 A9 9 0 0 1 36 39.7 A9 9 0 0 1 24 39.7 A9 9 0 0 1 9 33 Z"/><path d="M51 33 Q56 29 56 23"/><circle cx="18" cy="33" r="2.6" fill="currentColor" stroke="none"/><circle cx="30" cy="33" r="2.6" fill="currentColor" stroke="none"/><circle cx="42" cy="33" r="2.6" fill="currentColor" stroke="none"/></g>';

export const iconSvg = (key: FoodKey, size = 40): string =>
  svg(key === 'natto' ? NATTO_BODY : key === 'tofu' ? TOFU_BODY : POD_BODY, size);

export const FOODS: FoodDef[] = [
  { key: 'natto', label: '納豆', unit: '1パック(45g)', protein: 7.4, icon: NATTO_BODY },
  { key: 'tofu', label: '豆腐', unit: '1食(木綿150g)', protein: 10.5, icon: TOFU_BODY },
  { key: 'edamame', label: '枝豆', unit: '1皿(さや付き100g)', protein: 6.3, icon: POD_BODY },
];

export const FOOD_KEYS: FoodKey[] = FOODS.map((f) => f.key);

export function foodDef(key: FoodKey): FoodDef {
  return FOODS.find((f) => f.key === key) as FoodDef;
}

export function isFoodKey(v: unknown): v is FoodKey {
  return v === 'natto' || v === 'tofu' || v === 'edamame';
}

export const BUILTIN_RECIPES: Recipe[] = [
  { id: 'b-natto-kimchi', food: 'natto', title: 'キムチ納豆', note: 'キムチをのせるだけ。発酵×発酵でうま味が倍増。ごま油をひとたらし。', builtin: true },
  { id: 'b-natto-avocado', food: 'natto', title: '納豆×アボカド', note: '角切りアボカドと混ぜて、しょうゆ少々。まろやかでごはんが進む。', builtin: true },
  { id: 'b-natto-okra', food: 'natto', title: 'オクラ納豆', note: '刻んだオクラと合わせてねばねば二重奏。かつお節をのせて。', builtin: true },
  { id: 'b-natto-ume', food: 'natto', title: '梅しそ納豆', note: 'たたいた梅と刻み大葉で、さっぱり味に。暑い日にも。', builtin: true },
  { id: 'b-natto-omelet', food: 'natto', title: '納豆オムレツ', note: '付属のたれで味付けした納豆を卵で包むだけ。においがやわらぐ。', builtin: true },
  { id: 'b-natto-toast', food: 'natto', title: '納豆チーズトースト', note: '食パンに納豆とチーズをのせて焼く。意外な相性の良さ。', builtin: true },
  { id: 'b-natto-pasta', food: 'natto', title: '和風納豆パスタ', note: 'ゆでたパスタに納豆・バター・しょうゆ・のりを絡めるだけ。', builtin: true },
  { id: 'b-natto-negi', food: 'natto', title: 'ねぎ塩ごま油納豆', note: 'たれの代わりに塩とごま油、たっぷりの青ねぎで。', builtin: true },

  { id: 'b-tofu-olive', food: 'tofu', title: '冷奴×オリーブオイル', note: 'しょうゆの代わりにオリーブオイルと塩、黒こしょう。洋風の前菜に。', builtin: true },
  { id: 'b-tofu-kimchi', food: 'tofu', title: 'キムチ奴', note: '冷奴にキムチとごま油。のりを散らせば立派な一品。', builtin: true },
  { id: 'b-tofu-steak', food: 'tofu', title: '豆腐ステーキ', note: '水切りした木綿豆腐を焼き、しょうゆバターで仕上げる。', builtin: true },
  { id: 'b-tofu-miso', food: 'tofu', title: '豆腐とわかめの味噌汁', note: 'いつもの味噌汁に豆腐を。毎日続けやすい定番。', builtin: true },
  { id: 'b-tofu-yudofu', food: 'tofu', title: '湯豆腐', note: '昆布だしで温めてポン酢で。寒い日のほっとする一品。', builtin: true },
  { id: 'b-tofu-mabo', food: 'tofu', title: '麻婆豆腐', note: 'ひき肉と一緒にがっつり。ごはんのおかずにぴったり。', builtin: true },
  { id: 'b-tofu-caprese', food: 'tofu', title: '豆腐カプレーゼ', note: 'モッツァレラの代わりに豆腐とトマト、バジルを交互に並べて。', builtin: true },
  { id: 'b-tofu-agedashi', food: 'tofu', title: '揚げ焼き出し豆腐', note: '片栗粉をまぶして少なめの油で焼き、めんつゆをかける。', builtin: true },

  { id: 'b-eda-salt', food: 'edamame', title: '塩ゆで枝豆', note: '塩もみしてからゆでると色鮮やか。冷凍でもOK。', builtin: true },
  { id: 'b-eda-peperon', food: 'edamame', title: 'ペペロンチーノ枝豆', note: 'にんにくと唐辛子をオリーブオイルで炒め、枝豆をさやごと絡める。', builtin: true },
  { id: 'b-eda-rice', food: 'edamame', title: '枝豆ごはん', note: '炊き上がったごはんにむき枝豆と塩を混ぜるだけ。', builtin: true },
  { id: 'b-eda-cheese', food: 'edamame', title: '枝豆チーズせんべい', note: 'むき枝豆とチーズをフライパンで焼き固める。おつまみに。', builtin: true },
  { id: 'b-eda-dashi', food: 'edamame', title: '枝豆のだし浸し', note: 'ゆでた枝豆を白だしに浸して冷やす。作り置きに。', builtin: true },
  { id: 'b-eda-tuna', food: 'edamame', title: '枝豆とツナのサラダ', note: 'むき枝豆・ツナ・コーンをマヨネーズで和えて。', builtin: true },
  { id: 'b-eda-egg', food: 'edamame', title: '枝豆入り卵焼き', note: '卵液にむき枝豆を混ぜて焼く。お弁当の彩りにも。', builtin: true },
  { id: 'b-eda-soup', food: 'edamame', title: '枝豆の冷製スープ', note: '枝豆と牛乳・コンソメをミキサーにかけて冷やすだけ。', builtin: true },
];
