import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

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
export const db = getFirestore(app);

export default app;
