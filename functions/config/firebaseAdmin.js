import admin from "firebase-admin";

// Initialize only if it hasn't been initialized yet
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

export { admin, db };