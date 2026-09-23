import { User } from 'firebase/auth';
import { onAuthChange, loginWithGoogle, logout } from './auth';
import { showToast, openOverlay, closeOverlay, textEl, iconEl, button } from './ui';
import { submitFeedback } from './feedback';
import {
  todayKey, dateKey, labelOf, monthKey, daysInMonth, hashString,
} from './dates';
import {
  FOODS, FOOD_KEYS, BUILTIN_RECIPES, foodDef, iconSvg, isFoodKey,
} from './foods';
import {
  subscribeDays, subscribeRecipes, subscribeFavorites, changeCount, removeRecipeLog,
  createRecipe, deleteRecipe, setFavorite,
} from './store';
import {
  countsOn, isComplete, proteinOf, streak, summarizeMonth, totalOf,
} from './stats';
import { DayLog, FoodKey, Recipe } from './types';

// ============================================================
// DOM refs
// ============================================================
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const loginScreen = $('login-screen');
const appEl = $('app');
const userInfo = $('user-info');
const userAvatar = $<HTMLImageElement>('user-avatar');
const userName = $('user-name');
const btnGoogleLogin = $<HTMLButtonElement>('btn-google-login');
const btnLogout = $<HTMLButtonElement>('btn-logout');

const todayDateEl = $('today-date');
const streakNumEl = $('streak-num');
const foodTilesEl = $('food-tiles');
const completeBanner = $('complete-banner');
const todayProteinEl = $('today-protein');
const completeStreakEl = $('complete-streak');

const pickCard = $('pick-card');

const monthLabel = $('month-label');
const calendarGrid = $('calendar-grid');
const calendarLegend = $('calendar-legend');
const btnPrevMonth = $<HTMLButtonElement>('btn-prev-month');
const btnNextMonth = $<HTMLButtonElement>('btn-next-month');

const summaryTitle = $('summary-title');
const sumActive = $('sum-active');
const sumComplete = $('sum-complete');
const sumProtein = $('sum-protein');
const sumBars = $('sum-bars');
const sumRanking = $('sum-ranking');

const recipeTabs = $('recipe-tabs');
const recipeList = $('recipe-list');
const recipeEmpty = $('recipe-empty');
const recipeForm = $<HTMLFormElement>('recipe-form');
const recipeFoodSelect = $('recipe-food-select');
const inputRecipeTitle = $<HTMLInputElement>('input-recipe-title');
const inputRecipeNote = $<HTMLTextAreaElement>('input-recipe-note');
const btnRecipeSubmit = $<HTMLButtonElement>('btn-recipe-submit');

const dayOverlay = $('day-modal-overlay');
const dayModalTitle = $('day-modal-title');
const dayModalBody = $('day-modal-body');
const btnDayClose = $<HTMLButtonElement>('btn-day-close');

const confirmOverlay = $('confirm-dialog-overlay');
const confirmDialogTitle = $('confirm-dialog-title');
const btnConfirmCancel = $<HTMLButtonElement>('btn-confirm-cancel');
const btnConfirmDelete = $<HTMLButtonElement>('btn-confirm-delete');

const feedbackBtn = $<HTMLButtonElement>('feedback-btn');
const feedbackOverlay = $('feedback-modal-overlay');
const inputFeedbackMessage = $<HTMLTextAreaElement>('input-feedback-message');
const btnFeedbackClose = $<HTMLButtonElement>('btn-feedback-close');
const btnFeedbackSend = $<HTMLButtonElement>('btn-feedback-send');

// ============================================================
// State
// ============================================================
type RecipeFilter = 'all' | 'fav' | FoodKey;

interface State {
  uid: string | null;
  unsubscribers: (() => void)[];
  days: Map<string, DayLog>;
  customRecipes: Recipe[];
  favorites: Set<string>;
  viewYear: number;
  viewMonth: number;
  pickOffset: number;
  recipeFilter: RecipeFilter;
  formFood: FoodKey;
  modalDate: string | null;
  pending: Set<string>;
  confirmAction: (() => Promise<void>) | null;
}

const now = new Date();
const state: State = {
  uid: null,
  unsubscribers: [],
  days: new Map(),
  customRecipes: [],
  favorites: new Set(),
  viewYear: now.getFullYear(),
  viewMonth: now.getMonth(),
  pickOffset: 0,
  recipeFilter: 'natto',
  formFood: 'natto',
  modalDate: null,
  pending: new Set(),
  confirmAction: null,
};

// ============================================================
// Helpers
// ============================================================
/** 日ごとのアレンジ記録のキー: `${food}_${recipeId}`（削除済みアレンジでも品目がわかるように） */
const recipeLogKey = (food: FoodKey, id: string): string => `${food}_${id}`;

function parseRecipeLogKey(key: string): { food: FoodKey; id: string } | null {
  const i = key.indexOf('_');
  if (i < 0) return null;
  const food = key.slice(0, i);
  return isFoodKey(food) ? { food, id: key.slice(i + 1) } : null;
}

const allRecipes = (): Recipe[] => [...state.customRecipes, ...BUILTIN_RECIPES];

const findRecipe = (id: string): Recipe | undefined => allRecipes().find((r) => r.id === id);

/** 同じキーの処理が進行中なら何もしない（二重送信防止） */
async function withLock(key: string, fn: () => Promise<void>, errorMessage = '保存に失敗しました。通信環境を確認してください'): Promise<void> {
  if (state.pending.has(key)) return;
  state.pending.add(key);
  renderAll();
  try {
    await fn();
  } catch (err) {
    console.error(err);
    showToast(errorMessage);
  } finally {
    state.pending.delete(key);
    renderAll();
  }
}

const isPending = (key: string): boolean => state.pending.has(key);

function foodTag(food: FoodKey): HTMLElement {
  return textEl('span', `food-tag food-tag--${food}`, foodDef(food).label);
}

// ============================================================
// Actions
// ============================================================
function addFood(date: string, food: FoodKey, recipe?: Recipe): Promise<void> {
  const uid = state.uid;
  if (!uid) return Promise.resolve();
  const lockKey = recipe ? `eat:${recipe.id}` : `add:${date}:${food}`;
  return withLock(lockKey, async () => {
    await changeCount(uid, date, food, 1, recipe ? recipeLogKey(food, recipe.id) : undefined);
    if (recipe) showToast(`「${recipe.title}」を記録しました`);
  });
}

/** 1回分取り消す。アレンジ無しの記録を優先して減らし、なければ最後のアレンジ記録を取り消す */
function subtractFood(date: string, food: FoodKey): Promise<void> {
  const uid = state.uid;
  const log = state.days.get(date);
  if (!uid || !log || log.counts[food] <= 0) return Promise.resolve();
  const recipeEntries = Object.entries(log.recipes).filter(([k]) => parseRecipeLogKey(k)?.food === food);
  const recipeTotal = recipeEntries.reduce((s, [, n]) => s + n, 0);
  return withLock(`sub:${date}:${food}`, async () => {
    if (log.counts[food] > recipeTotal || recipeEntries.length === 0) {
      await changeCount(uid, date, food, -1);
    } else {
      const [key, n] = recipeEntries[recipeEntries.length - 1];
      await removeRecipeLog(uid, date, food, key, n);
    }
  });
}

function removeLog(date: string, key: string): Promise<void> {
  const uid = state.uid;
  const parsed = parseRecipeLogKey(key);
  const n = state.days.get(date)?.recipes[key] ?? 0;
  if (!uid || !parsed || n <= 0) return Promise.resolve();
  return withLock(`rm:${date}:${key}`, () => removeRecipeLog(uid, date, parsed.food, key, n));
}

function toggleFavorite(recipe: Recipe): Promise<void> {
  const uid = state.uid;
  if (!uid) return Promise.resolve();
  const on = !state.favorites.has(recipe.id);
  return withLock(`fav:${recipe.id}`, () => setFavorite(uid, recipe.id, on));
}

function askDeleteRecipe(recipe: Recipe): void {
  const uid = state.uid;
  if (!uid) return;
  confirmDialogTitle.textContent = `「${recipe.title}」を削除しますか？`;
  state.confirmAction = async () => {
    await deleteRecipe(uid, recipe.id);
    if (state.favorites.has(recipe.id)) await setFavorite(uid, recipe.id, false);
    showToast('アレンジを削除しました');
  };
  openOverlay(confirmOverlay);
}

// ============================================================
// Render: 今日
// ============================================================
function renderToday(): void {
  const today = todayKey();
  const counts = countsOn(state.days, today);
  todayDateEl.textContent = labelOf(today);
  streakNumEl.textContent = String(streak(state.days, today, (c) => totalOf(c) > 0));
  completeStreakEl.textContent = String(streak(state.days, today, isComplete));
  todayProteinEl.textContent = proteinOf(counts).toFixed(1);
  completeBanner.classList.toggle('hidden', !isComplete(counts));

  foodTilesEl.replaceChildren(...FOODS.map((f) => {
    const n = counts[f.key];
    const tile = document.createElement('div');
    tile.className = `food-tile food-tile--${f.key}${n > 0 ? ' is-done' : ''}`;

    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'food-tile__add';
    add.disabled = isPending(`add:${today}:${f.key}`);
    add.setAttribute('aria-label', `${f.label}を食べた`);
    add.append(
      iconEl(iconSvg(f.key, 44), 'food-tile__icon'),
      textEl('span', 'food-tile__label', f.label),
      textEl('span', 'food-tile__count', n > 0 ? `${n}回` : 'まだ'),
      textEl('span', 'food-tile__cta', '＋ 食べた'),
    );
    add.addEventListener('click', () => { void addFood(today, f.key); });

    const sub = button('−1', 'food-tile__sub', () => { void subtractFood(today, f.key); });
    sub.disabled = n <= 0 || isPending(`sub:${today}:${f.key}`);
    sub.setAttribute('aria-label', `${f.label}の記録を1回取り消す`);

    tile.append(add, sub);
    return tile;
  }));
}

// ============================================================
// Render: 今日のおすすめ
// ============================================================
function renderPick(): void {
  const list = allRecipes();
  const recipe = list[(hashString(todayKey()) + state.pickOffset) % list.length];
  const favOn = state.favorites.has(recipe.id);

  const head = document.createElement('div');
  head.className = 'pick__head';
  head.append(foodTag(recipe.food), favButton(recipe, favOn));

  const eat = button('これを食べた', 'btn btn--primary', () => { void addFood(todayKey(), recipe.food, recipe); });
  eat.disabled = isPending(`eat:${recipe.id}`);
  const other = button('ほかの案', 'btn btn--ghost', () => {
    state.pickOffset += 1 + Math.floor(Math.random() * (list.length - 1));
    renderPick();
  });
  const actions = document.createElement('div');
  actions.className = 'pick__actions';
  actions.append(eat, other);

  pickCard.replaceChildren(
    head,
    textEl('h3', 'pick__title', recipe.title),
    textEl('p', 'pick__note', recipe.note || 'メモなし'),
    actions,
  );
}

const STAR = '<svg width="22" height="22" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M32 8 L39 24 L56 25.5 L43 37 L47 54 L32 45 L17 54 L21 37 L8 25.5 L25 24 Z"/></svg>';

function favButton(recipe: Recipe, on: boolean): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `fav-btn${on ? ' is-on' : ''}`;
  b.setAttribute('aria-pressed', String(on));
  b.setAttribute('aria-label', on ? 'お気に入りから外す' : 'お気に入りに追加');
  b.disabled = isPending(`fav:${recipe.id}`);
  b.append(iconEl(STAR));
  b.addEventListener('click', () => { void toggleFavorite(recipe); });
  return b;
}

// ============================================================
// Render: カレンダー
// ============================================================
function renderCalendar(): void {
  const { viewYear: y, viewMonth: m } = state;
  const today = todayKey();
  monthLabel.textContent = `${y}年${m + 1}月`;
  const cur = new Date();
  btnNextMonth.disabled = y > cur.getFullYear() || (y === cur.getFullYear() && m >= cur.getMonth());

  const cells: HTMLElement[] = [];
  const lead = new Date(y, m, 1).getDay();
  for (let i = 0; i < lead; i++) cells.push(textEl('span', 'cal-cell cal-cell--blank', ''));

  for (let d = 1; d <= daysInMonth(y, m); d++) {
    const key = dateKey(new Date(y, m, d));
    const counts = countsOn(state.days, key);
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'cal-cell';
    if (isComplete(counts)) cell.classList.add('is-complete');
    if (key === today) cell.classList.add('is-today');
    cell.disabled = key > today;
    cell.setAttribute('aria-label', `${labelOf(key)} ${FOODS.map((f) => `${f.label}${counts[f.key]}回`).join('、')}`);

    const dots = document.createElement('span');
    dots.className = 'cal-cell__dots';
    FOODS.forEach((f) => {
      dots.append(textEl('span', `cal-dot cal-dot--${f.key}${counts[f.key] > 0 ? ' is-on' : ''}`, ''));
    });
    cell.append(textEl('span', 'cal-cell__day', String(d)), dots);
    cell.addEventListener('click', () => openDayModal(key));
    cells.push(cell);
  }
  calendarGrid.replaceChildren(...cells);
}

function renderLegend(): void {
  const items = FOODS.map((f) => {
    const el = document.createElement('span');
    el.className = 'legend__item';
    el.append(textEl('span', `cal-dot cal-dot--${f.key} is-on`, ''), document.createTextNode(f.label));
    return el;
  });
  const comp = document.createElement('span');
  comp.className = 'legend__item';
  comp.append(textEl('span', 'legend__complete', ''), document.createTextNode('コンプリート'));
  calendarLegend.replaceChildren(...items, comp);
}

// ============================================================
// Render: 日付モーダル
// ============================================================
function openDayModal(date: string): void {
  state.modalDate = date;
  renderDayModal();
  openOverlay(dayOverlay);
}

function renderDayModal(): void {
  const date = state.modalDate;
  if (!date) return;
  const log = state.days.get(date);
  const counts = countsOn(state.days, date);
  dayModalTitle.textContent = labelOf(date);

  const rows = FOODS.map((f) => {
    const row = document.createElement('div');
    row.className = `day-row day-row--${f.key}`;
    const sub = button('−', 'step-btn', () => { void subtractFood(date, f.key); });
    sub.disabled = counts[f.key] <= 0 || isPending(`sub:${date}:${f.key}`);
    sub.setAttribute('aria-label', `${f.label}を1回減らす`);
    const add = button('＋', 'step-btn', () => { void addFood(date, f.key); });
    add.disabled = isPending(`add:${date}:${f.key}`);
    add.setAttribute('aria-label', `${f.label}を1回増やす`);
    const stepper = document.createElement('div');
    stepper.className = 'stepper';
    stepper.append(sub, textEl('span', 'stepper__value', `${counts[f.key]}回`), add);
    row.append(iconEl(iconSvg(f.key, 28), 'day-row__icon'), textEl('span', 'day-row__label', f.label), stepper);
    return row;
  });

  const logs = Object.entries(log?.recipes ?? {});
  const logSection = document.createElement('div');
  logSection.className = 'day-logs';
  logSection.append(textEl('h4', 'day-logs__title', 'この日のアレンジ'));
  if (logs.length === 0) {
    logSection.append(textEl('p', 'day-logs__empty', 'アレンジの記録はありません'));
  } else {
    const ul = document.createElement('ul');
    ul.className = 'day-logs__list';
    logs.forEach(([key, n]) => {
      const parsed = parseRecipeLogKey(key);
      if (!parsed) return;
      const li = document.createElement('li');
      li.className = 'day-logs__item';
      const title = findRecipe(parsed.id)?.title ?? '（削除したアレンジ）';
      const rm = button('取り消す', 'btn btn--ghost btn--sm', () => { void removeLog(date, key); });
      rm.disabled = isPending(`rm:${date}:${key}`);
      li.append(foodTag(parsed.food), textEl('span', 'day-logs__name', `${title}${n > 1 ? ` ×${n}` : ''}`), rm);
      ul.append(li);
    });
    logSection.append(ul);
  }

  const meta = textEl('p', 'day-meta', `たんぱく質の目安 ${proteinOf(counts).toFixed(1)} g${isComplete(counts) ? '　・　コンプリート！' : ''}`);
  dayModalBody.replaceChildren(...rows, meta, logSection);
}

// ============================================================
// Render: 月のまとめ
// ============================================================
function renderSummary(): void {
  const { viewYear: y, viewMonth: m } = state;
  const s = summarizeMonth(state.days, monthKey(y, m));
  const cur = new Date();
  const isThisMonth = y === cur.getFullYear() && m === cur.getMonth();
  summaryTitle.textContent = isThisMonth ? '今月のまとめ' : `${y}年${m + 1}月のまとめ`;
  sumActive.textContent = String(s.activeDays);
  sumComplete.textContent = String(s.completeDays);
  sumProtein.textContent = String(Math.round(s.protein));

  const max = Math.max(1, ...FOOD_KEYS.map((k) => s.counts[k]));
  sumBars.replaceChildren(...FOODS.map((f) => {
    const row = document.createElement('div');
    row.className = 'bar';
    const track = document.createElement('span');
    track.className = 'bar__track';
    const fill = textEl('span', `bar__fill bar__fill--${f.key}`, '');
    fill.style.width = `${(s.counts[f.key] / max) * 100}%`;
    track.append(fill);
    row.append(textEl('span', 'bar__label', f.label), track, textEl('span', 'bar__value', `${s.counts[f.key]}回`));
    return row;
  }));

  const top = s.recipeRanking
    .map(({ id, count }) => ({ parsed: parseRecipeLogKey(id), count }))
    .filter((r): r is { parsed: { food: FoodKey; id: string }; count: number } => r.parsed !== null)
    .slice(0, 5);
  if (top.length === 0) {
    sumRanking.replaceChildren(textEl('li', 'ranking__empty', 'アレンジ帳の「食べた」で記録すると、ここにランキングが出ます'));
  } else {
    sumRanking.replaceChildren(...top.map(({ parsed, count }, i) => {
      const li = document.createElement('li');
      li.className = 'ranking__item';
      li.append(
        textEl('span', 'ranking__rank', String(i + 1)),
        foodTag(parsed.food),
        textEl('span', 'ranking__name', findRecipe(parsed.id)?.title ?? '（削除したアレンジ）'),
        textEl('span', 'ranking__count', `${count}回`),
      );
      return li;
    }));
  }
}

// ============================================================
// Render: アレンジ帳
// ============================================================
const FILTERS: { key: RecipeFilter; label: string }[] = [
  { key: 'all', label: 'すべて' },
  ...FOODS.map((f) => ({ key: f.key as RecipeFilter, label: f.label })),
  { key: 'fav', label: '★ お気に入り' },
];

function renderRecipes(): void {
  recipeTabs.replaceChildren(...FILTERS.map((f) => {
    const b = button(f.label, `tab${state.recipeFilter === f.key ? ' is-active' : ''}`, () => {
      state.recipeFilter = f.key;
      if (isFoodKey(f.key)) state.formFood = f.key;
      renderRecipes();
    });
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(state.recipeFilter === f.key));
    return b;
  }));

  const filter = state.recipeFilter;
  const list = allRecipes().filter((r) => {
    if (filter === 'all') return true;
    if (filter === 'fav') return state.favorites.has(r.id);
    return r.food === filter;
  });

  recipeEmpty.textContent = filter === 'fav' ? '☆ を押したアレンジがここに並びます。' : 'まだありません。';
  recipeEmpty.classList.toggle('hidden', list.length > 0);

  recipeList.replaceChildren(...list.map((r) => {
    const card = document.createElement('article');
    card.className = 'recipe-card';
    const head = document.createElement('div');
    head.className = 'recipe-card__head';
    head.append(foodTag(r.food));
    if (!r.builtin) head.append(textEl('span', 'mine-tag', 'マイアレンジ'));
    head.append(favButton(r, state.favorites.has(r.id)));

    const actions = document.createElement('div');
    actions.className = 'recipe-card__actions';
    if (!r.builtin) {
      actions.append(button('削除', 'btn btn--ghost btn--sm is-danger', () => askDeleteRecipe(r)));
    }
    const eat = button('食べた', 'btn btn--primary btn--sm', () => { void addFood(todayKey(), r.food, r); });
    eat.disabled = isPending(`eat:${r.id}`);
    actions.append(eat);

    card.append(head, textEl('h3', 'recipe-card__title', r.title));
    if (r.note) card.append(textEl('p', 'recipe-card__note', r.note));
    card.append(actions);
    return card;
  }));

  recipeFoodSelect.replaceChildren(...FOODS.map((f) => {
    const b = button(f.label, `segmented__item${state.formFood === f.key ? ' is-active' : ''}`, () => {
      state.formFood = f.key;
      renderRecipes();
    });
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(state.formFood === f.key));
    return b;
  }));
  btnRecipeSubmit.disabled = isPending('recipe:create');
}

function renderAll(): void {
  if (!state.uid) return;
  renderToday();
  renderPick();
  renderCalendar();
  renderSummary();
  renderRecipes();
  if (dayOverlay.classList.contains('is-open')) renderDayModal();
}

// ============================================================
// Auth
// ============================================================
function stopSubscriptions(): void {
  state.unsubscribers.forEach((u) => u());
  state.unsubscribers = [];
}

function onLoadError(err: Error): void {
  console.error(err);
  showToast('データの読み込みに失敗しました。再読み込みしてください');
}

function handleUser(user: User | null): void {
  stopSubscriptions();
  if (!user) {
    state.uid = null;
    state.days = new Map();
    state.customRecipes = [];
    state.favorites = new Set();
    appEl.classList.add('hidden');
    loginScreen.classList.remove('hidden');
    userInfo.classList.add('hidden');
    return;
  }
  state.uid = user.uid;
  loginScreen.classList.add('hidden');
  appEl.classList.remove('hidden');
  userInfo.classList.remove('hidden');
  userName.textContent = user.displayName ?? '';
  if (user.photoURL) {
    userAvatar.src = user.photoURL;
    userAvatar.classList.remove('hidden');
  } else {
    userAvatar.classList.add('hidden');
  }

  renderAll();
  state.unsubscribers.push(
    subscribeDays(user.uid, (days) => { state.days = days; renderAll(); }, onLoadError),
    subscribeRecipes(user.uid, (list) => { state.customRecipes = list; renderAll(); }, onLoadError),
    subscribeFavorites(user.uid, (ids) => { state.favorites = ids; renderAll(); }, onLoadError),
  );
}

// ============================================================
// Events
// ============================================================
btnGoogleLogin.addEventListener('click', async () => {
  btnGoogleLogin.disabled = true;
  try {
    await loginWithGoogle();
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
      console.error(err);
      showToast('ログインに失敗しました');
    }
  } finally {
    btnGoogleLogin.disabled = false;
  }
});

btnLogout.addEventListener('click', async () => {
  try {
    await logout();
  } catch (err) {
    console.error(err);
    showToast('ログアウトに失敗しました');
  }
});

btnPrevMonth.addEventListener('click', () => {
  const d = new Date(state.viewYear, state.viewMonth - 1, 1);
  state.viewYear = d.getFullYear();
  state.viewMonth = d.getMonth();
  renderAll();
});

btnNextMonth.addEventListener('click', () => {
  const d = new Date(state.viewYear, state.viewMonth + 1, 1);
  state.viewYear = d.getFullYear();
  state.viewMonth = d.getMonth();
  renderAll();
});

btnDayClose.addEventListener('click', () => {
  closeOverlay(dayOverlay);
  state.modalDate = null;
});

recipeForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const uid = state.uid;
  const title = inputRecipeTitle.value.trim();
  const note = inputRecipeNote.value.trim();
  if (!uid) return;
  if (!title) {
    showToast('アレンジ名を入力してください');
    inputRecipeTitle.focus();
    return;
  }
  const food = state.formFood;
  void withLock('recipe:create', async () => {
    await createRecipe(uid, food, title.slice(0, 40), note.slice(0, 200));
    inputRecipeTitle.value = '';
    inputRecipeNote.value = '';
    state.recipeFilter = food;
    showToast('アレンジ帳に追加しました');
  });
});

btnConfirmCancel.addEventListener('click', () => {
  state.confirmAction = null;
  closeOverlay(confirmOverlay);
});

btnConfirmDelete.addEventListener('click', async () => {
  const action = state.confirmAction;
  if (!action) return;
  btnConfirmDelete.disabled = true;
  try {
    await action();
    state.confirmAction = null;
    closeOverlay(confirmOverlay);
  } catch (err) {
    console.error(err);
    showToast('削除に失敗しました');
  } finally {
    btnConfirmDelete.disabled = false;
  }
});

feedbackBtn.addEventListener('click', () => {
  openOverlay(feedbackOverlay);
  inputFeedbackMessage.focus();
});

btnFeedbackClose.addEventListener('click', () => closeOverlay(feedbackOverlay));

btnFeedbackSend.addEventListener('click', async () => {
  const message = inputFeedbackMessage.value.trim();
  if (!message) {
    showToast('内容を入力してください');
    return;
  }
  btnFeedbackSend.disabled = true;
  const ok = await submitFeedback(message);
  btnFeedbackSend.disabled = false;
  if (ok) {
    inputFeedbackMessage.value = '';
    closeOverlay(feedbackOverlay);
    showToast('送信しました。ありがとうございます！');
  } else {
    showToast('送信に失敗しました。時間をおいてお試しください');
  }
});

// オーバーレイの背景クリック / Escで閉じる
[dayOverlay, feedbackOverlay, confirmOverlay].forEach((overlay) => {
  overlay.addEventListener('click', (e) => {
    if (e.target !== overlay) return;
    closeOverlay(overlay);
    if (overlay === dayOverlay) state.modalDate = null;
    if (overlay === confirmOverlay) state.confirmAction = null;
  });
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  [dayOverlay, feedbackOverlay, confirmOverlay].forEach((o) => closeOverlay(o));
  state.modalDate = null;
  state.confirmAction = null;
});

// 日付をまたいでアプリを開きっぱなしにしても「今日」を更新する
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') renderAll();
});

renderLegend();
onAuthChange(handleUser);
