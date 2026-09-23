import {
  collection, doc, onSnapshot, setDoc, addDoc, deleteDoc, deleteField, increment,
  serverTimestamp, query, orderBy,
} from 'firebase/firestore';
import { db } from './firebase';
import { isFoodKey } from './foods';
import { DayLog, FoodKey, Recipe } from './types';

const toCount = (v: unknown): number => (typeof v === 'number' && v > 0 ? Math.floor(v) : 0);

export function subscribeDays(
  uid: string,
  onData: (days: Map<string, DayLog>) => void,
  onError: (err: Error) => void,
): () => void {
  return onSnapshot(collection(db, 'users', uid, 'days'), (snap) => {
    const map = new Map<string, DayLog>();
    snap.forEach((d) => {
      const data = d.data();
      const recipes: Record<string, number> = {};
      if (data.recipes && typeof data.recipes === 'object') {
        Object.entries(data.recipes as Record<string, unknown>).forEach(([k, v]) => {
          const n = toCount(v);
          if (n > 0) recipes[k] = n;
        });
      }
      map.set(d.id, {
        date: d.id,
        counts: { natto: toCount(data.natto), tofu: toCount(data.tofu), edamame: toCount(data.edamame) },
        recipes,
      });
    });
    onData(map);
  }, onError);
}

/** その日の品目の回数を delta だけ増減する（マイナスにはしない前提で呼び出し側がチェック） */
export function changeCount(uid: string, date: string, food: FoodKey, delta: number, recipeId?: string): Promise<void> {
  const payload: Record<string, unknown> = { [food]: increment(delta), updatedAt: serverTimestamp() };
  if (recipeId) payload.recipes = { [recipeId]: increment(delta) };
  return setDoc(doc(db, 'users', uid, 'days', date), payload, { merge: true });
}

/** その日のアレンジ記録を1件取り消す（品目の回数も1減らす） */
export function removeRecipeLog(uid: string, date: string, food: FoodKey, recipeId: string, current: number): Promise<void> {
  return setDoc(doc(db, 'users', uid, 'days', date), {
    [food]: increment(-1),
    recipes: { [recipeId]: current <= 1 ? deleteField() : increment(-1) },
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export function subscribeRecipes(
  uid: string,
  onData: (recipes: Recipe[]) => void,
  onError: (err: Error) => void,
): () => void {
  const q = query(collection(db, 'users', uid, 'recipes'), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => {
    const list: Recipe[] = [];
    snap.forEach((d) => {
      const data = d.data();
      if (!isFoodKey(data.food) || typeof data.title !== 'string') return;
      list.push({
        id: d.id,
        food: data.food,
        title: data.title,
        note: typeof data.note === 'string' ? data.note : '',
        builtin: false,
      });
    });
    onData(list);
  }, onError);
}

export async function createRecipe(uid: string, food: FoodKey, title: string, note: string): Promise<void> {
  await addDoc(collection(db, 'users', uid, 'recipes'), { food, title, note, createdAt: serverTimestamp() });
}

export function deleteRecipe(uid: string, id: string): Promise<void> {
  return deleteDoc(doc(db, 'users', uid, 'recipes', id));
}

export function subscribeFavorites(
  uid: string,
  onData: (ids: Set<string>) => void,
  onError: (err: Error) => void,
): () => void {
  return onSnapshot(doc(db, 'users', uid, 'meta', 'prefs'), (snap) => {
    const favs = snap.exists() ? snap.data().favorites : null;
    const ids = new Set<string>();
    if (favs && typeof favs === 'object') {
      Object.entries(favs as Record<string, unknown>).forEach(([k, v]) => {
        if (v === true) ids.add(k);
      });
    }
    onData(ids);
  }, onError);
}

export function setFavorite(uid: string, recipeId: string, on: boolean): Promise<void> {
  return setDoc(doc(db, 'users', uid, 'meta', 'prefs'), {
    favorites: { [recipeId]: on ? true : deleteField() },
    updatedAt: serverTimestamp(),
  }, { merge: true });
}
