import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

// NOTE: Firebase の Web 設定は秘匿情報ではなく、実質的な防御は firestore.rules 側で行う。
// （他のミニアプリと同様に、この値はコミットして良い）
const firebaseConfig = {
  apiKey: 'AIzaSyCpc5JEZ0VIbMQFY3cloOQoGo7XY5B1obg',
  authDomain: 'mame-biyori.firebaseapp.com',
  projectId: 'mame-biyori',
  storageBucket: 'mame-biyori.firebasestorage.app',
  messagingSenderId: '17825983401',
  appId: '1:17825983401:web:128f72e3da0c3b1b6972b8',
};

export const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);
