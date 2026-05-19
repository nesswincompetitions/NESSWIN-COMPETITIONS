import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions';

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyD0taqW_k5gaZgXz7rPLapWX45sSEt_sfI",
  authDomain: "nesswin-competitions-3c1c2.firebaseapp.com",
  projectId: "nesswin-competitions-3c1c2",
  storageBucket: "nesswin-competitions-3c1c2.firebasestorage.app",
  messagingSenderId: "997721875986",
  appId: "1:997721875986:web:4724fe9414d4bbb61b9acb",
  measurementId: "G-ZJ9B9KPQNR"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
export const auth = getAuth(app);

// Firestore with offline persistence enabled.
// On repeat visits the UI renders instantly from the local IndexedDB cache
// while Firestore syncs the latest data from the network in the background.
// persistentMultipleTabManager ensures multiple open tabs share the same cache
// without conflicts.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
});

export const storage = getStorage(app);
export const functions = getFunctions(app, "us-central1"); // Ensure region matches your functions region

export default app;
