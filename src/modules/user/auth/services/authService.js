import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithPopup,
  signOut,
  RecaptchaVerifier,
  linkWithCredential,
  PhoneAuthProvider,
  sendPasswordResetEmail,
} from "firebase/auth";
import {
  doc,
  getDoc,
  setDoc,
  runTransaction,
  serverTimestamp,
  collection,
  query,
  where,
  getDocs,
  increment,
} from "firebase/firestore";
import { auth, db } from '@/config/firebase';

// ─── Referral Code Logic ────────────────────────────────────────────────────────
/**
 * Checks if a username is available.
 * Returns 'available', 'taken', or 'error'.
 */
export const checkUsernameAvailability = async (username, currentUid) => {
  const trimmed = username.trim().toLowerCase();
  const q = query(collection(db, 'user'), where('user_name', '==', trimmed));
  const snap = await getDocs(q);
  if (snap.empty) return 'available';
  const takenByOther = snap.docs.some(d => d.id !== currentUid);
  return takenByOther ? 'taken' : 'available';
};


export const generateReferralCode = (username) => {
  if (!username || username.trim().length === 0) {
    return null;
  }
  let cleanName = username.replace(/\s+/g, "").toUpperCase();
  let prefix = cleanName.length <= 5 ? cleanName : cleanName.substring(0, 5);
  while (prefix.length < 5) {
    prefix += "X";
  }
  const randomNumber = Math.floor(1000 + Math.random() * 9000);
  return `NESSWIN-${prefix}${randomNumber}`;
};

// ─── Auth Providers ───────────────────────────────────────────────────────────
const googleProvider = new GoogleAuthProvider();
const appleProvider = new OAuthProvider("apple.com");

// ─── Step 1: Initial Auth & Sparse Doc Creation ───────────────────────────────

/**
 * Ensures a user document exists. If not, creates a sparse one.
 */
export const checkAndCreateUserDocument = async (user, additionalData = {}) => {
  const userRef = doc(db, "user", user.uid);
  const userSnap = await getDoc(userRef);

  if (!userSnap.exists()) {
    const newUser = {
      uid: user.uid,
      email: user.email || "",
      display_name: user.displayName || additionalData.name || "",
      photo_url: user.photoURL || "",
      created_time: serverTimestamp(),
      is_verified: false,
      date_of_birth: additionalData.date_of_birth ? new Date(additionalData.date_of_birth) : null,
      free_tickets: 0,
      role: "user",
      is_active: true,
    };
    await setDoc(userRef, newUser);
    return newUser;
  }
  
  const userData = userSnap.data();
  if (userData.is_active === false) {
    await signOut(auth);
    throw new Error("Your account has been suspended. Please contact support.");
  }
  
  return userData;
};

export const signUpWithEmail = async (email, password, name, date_of_birth) => {
  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  await checkAndCreateUserDocument(userCredential.user, { name, date_of_birth });
  return userCredential.user;
};

export const signInWithEmail = async (email, password) => {
  const userCredential = await signInWithEmailAndPassword(auth, email, password);
  await checkAndCreateUserDocument(userCredential.user);
  return userCredential.user;
};

export const signInWithGoogle = async () => {
  const userCredential = await signInWithPopup(auth, googleProvider);
  await checkAndCreateUserDocument(userCredential.user);
  return userCredential.user;
};

export const signInWithApple = async () => {
  const userCredential = await signInWithPopup(auth, appleProvider);
  await checkAndCreateUserDocument(userCredential.user);
  return userCredential.user;
};

export const logout = async () => {
  try {
    const { clearAllCaches } = await import('@/shared/services/competitionCache');
    clearAllCaches();
  } catch (e) {
    // Non-critical — proceed with logout regardless
  }
  return signOut(auth);
};

export const passwordReset = async (email) => {
  await sendPasswordResetEmail(auth, email);
};

// ─── Step 2: Phone Verification ───────────────────────────────────────────────

/**
 * Initializes the reCAPTCHA verifier.
 */
export const setupRecaptcha = (containerId) => {
  if (!window.recaptchaVerifier) {
    window.recaptchaVerifier = new RecaptchaVerifier(auth, containerId, {
      size: "invisible",
    });
  }
  return window.recaptchaVerifier;
};

/**
 * Clears the reCAPTCHA verifier to prevent crashes on unmount.
 */
export const clearRecaptcha = () => {
  if (window.recaptchaVerifier) {
    window.recaptchaVerifier.clear();
    window.recaptchaVerifier = null;
  }
};

/**
 * Links a phone credential to the current user and updates Firestore.
 */
export const linkPhoneNumberToUser = async (verificationId, code) => {
  const user = auth.currentUser;
  if (!user) throw new Error("No user is logged in.");

  const credential = PhoneAuthProvider.credential(verificationId, code);
  
  try {
    const result = await linkWithCredential(user, credential);
    
    // Update user document with phone number
    const userRef = doc(db, "user", user.uid);
    await setDoc(userRef, { phone_number: result.user.phoneNumber }, { merge: true });
    
    return result.user;
  } catch (error) {
    throw error;
  }
};

// ─── Step 3: Username & Referral ──────────────────────────────────────────────

/**
 * Executes a transaction to claim a username and handle referral codes.
 */
export const completeOnboarding = async (username, referralCodeInput) => {
  const user = auth.currentUser;
  if (!user) throw new Error("No user is logged in.");

  // Always store username in lowercase — no need for a separate _lower field
  const cleanUsername = username.trim().toLowerCase();
  if (cleanUsername.length < 3) throw new Error("Username must be at least 3 characters.");

  let referrerRef = null;

  // 1. Verify Referral Code (If provided)
  if (referralCodeInput && referralCodeInput.trim() !== "") {
    const usersRef = collection(db, "user");
    const q = query(usersRef, where("referral_code", "==", referralCodeInput.trim().toUpperCase()));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      throw new Error("Invalid referral code.");
    }
    
    const referrerDoc = querySnapshot.docs[0];
    if (referrerDoc.id === user.uid) {
      throw new Error("You cannot use your own referral code.");
    }

    referrerRef = doc(db, "user", referrerDoc.id);
  }

  // 2. Check Username Uniqueness — query user_name directly (always stored lowercase)
  const usersRef = collection(db, "user");
  const usernameQuery = query(usersRef, where("user_name", "==", cleanUsername));
  const uqSnap = await getDocs(usernameQuery);

  if (!uqSnap.empty) {
    const existingUser = uqSnap.docs[0];
    if (existingUser.id !== user.uid) {
      throw new Error("Username is already taken.");
    }
  }

  // 3. Prepare data for the transaction
  const generatedReferralCode = generateReferralCode(cleanUsername);
  const currentUserRef = doc(db, "user", user.uid);


  // 4. Execute the Transaction (All reads must happen before writes)
  await runTransaction(db, async (transaction) => {
    
    // Read the current user doc
    const currentUserDoc = await transaction.get(currentUserRef);
    if (!currentUserDoc.exists()) {
      throw new Error("User document not found.");
    }

    const currentUserData = currentUserDoc.data();

    // EDGE CASE: Prevent duplicate referral usage on re-entry
    if (referrerRef && currentUserData?.referred_by) {
      throw new Error("Referral code already used.");
    }

    // Write: Update current user
    const updateData = {
      user_name: cleanUsername,
      referral_code: generatedReferralCode,
      is_verified: true,
    };

    if (referrerRef) {
      updateData.referred_by = referrerRef;
    }

    transaction.update(currentUserRef, updateData);

    // Write: Update referrer and create referral document if applicable
    if (referrerRef) {
      const newReferralRef = doc(collection(db, "referrals"));
      // Create audit log for the referral reward
      transaction.set(newReferralRef, {
        referrer_id: referrerRef,
        referred_user_id: currentUserRef,
        referral_code: referralCodeInput.trim().toUpperCase(),
        reward_type: "free_ticket",
        reward_value: 1,
        reward_issued: false,
        created_at: serverTimestamp(),
      });

      // Atomically credit 1 free ticket + increment referral_count for the referrer
      transaction.update(referrerRef, {
        free_tickets: increment(1),
        total_free_tickets: increment(1),
        referral_count: increment(1),
      });

      // Audit log for the auto-issued referral reward
      const logRef = doc(collection(db, "free_ticket_log"));
      transaction.set(logRef, {
        user_id: referrerRef,
        competition_id: null,
        order_id: null,
        quantity: 1,
        reason: "referral_auto_reward",
        reward_type: "referral",
        created_at: serverTimestamp(),
      });

      // ── Notification for Referrer ──────────────────────────────────────────
      const notifRef = doc(collection(db, "ff_user_push_notifications"));
      transaction.set(notifRef, {
        category: "rewards",
        created_at: serverTimestamp(),
        cta_text: "View Profile",
        initial_page_name: "Reffral",
        is_read: false,
        notification_image_url: "",
        notification_sound: "default",
        notification_text: `${currentUserData?.display_name || cleanUsername} used your code! You've received a free referral ticket.`,
        notification_title: "Referral Reward! 🎁",
        num_sent: 0,
        parameter_data: "{}",
        sender: currentUserRef,
        status: "",
        timestamp: serverTimestamp(),
        type: "referral_reward_received",
        user_refs: referrerRef.path,
      });
    }

    // ── Update Global Metrics ────────────────────────────────────────────────
    // Handled by dashboardController.js (onUserChangeDashboard)
  });

  // After successful transaction, clean up stored referral code
  if (referrerRef) {
    try {
      localStorage.removeItem('nesswin_referral_code');
    } catch (e) {
      // Ignore localStorage errors
    }
  }
};