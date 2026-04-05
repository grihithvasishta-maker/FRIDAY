import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, User } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, onSnapshot, getDocFromServer } from 'firebase/firestore';

const firebaseConfig = {
  projectId: "gen-lang-client-0025084840",
  appId: "1:182426590371:web:3b6e07085c6f1dcce4f316",
  apiKey: "AIzaSyCDD92RVjLZwbDBCaxVb2O5C82BDcxXLZ0",
  authDomain: "gen-lang-client-0025084840.firebaseapp.com",
  storageBucket: "gen-lang-client-0025084840.firebasestorage.app",
  messagingSenderId: "182426590371",
  measurementId: ""
};

const firestoreDatabaseId = "ai-studio-c59e5695-5c54-445d-b643-7a86fdc7eeb6";

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firestoreDatabaseId);
export const googleProvider = new GoogleAuthProvider();

export { signInWithPopup, onAuthStateChanged, doc, getDoc, setDoc, onSnapshot, getDocFromServer };
export type { User };

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration. The client is offline.");
    }
  }
}
testConnection();
