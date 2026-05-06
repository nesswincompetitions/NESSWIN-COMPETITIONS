import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { admin, db } from "../config/firebaseAdmin.js"; // <-- .js extension is required!

export const processReferralReward = onDocumentCreated("referrals/{referralId}", async (event) => {
  const referralData = event.data.data();
  const referralDocRef = event.data.ref;
  
  const referrerRef = referralData.referrer_id; 
  const referredUserRef = referralData.referred_user_id; 

  // EDGE CASE 1: Data Type Validation
  if (!referrerRef || typeof referrerRef.path !== 'string') {
    console.error("Invalid referrer reference. Skipping.");
    return;
  }

  // EDGE CASE 2: Backend Self-Referral Prevention
  if (referredUserRef && referrerRef.path === referredUserRef.path) {
    console.error(`Fraud attempt blocked: User ${referrerRef.id} tried to refer themselves.`);
    return;
  }

  // Idempotency check
  if (referralData.reward_issued) {
    console.log("Reward already issued for this referral.");
    return;
  }

  try {
    const rewardValue = referralData.reward_value || 1;

    // EDGE CASE 3: ATOMICITY 
    const batch = db.batch();

    batch.update(referrerRef, {
      free_tickets: admin.firestore.FieldValue.increment(rewardValue),
      total_free_tickets: admin.firestore.FieldValue.increment(rewardValue),
      referral_count: admin.firestore.FieldValue.increment(1)
    });


    await batch.commit();

    console.log(`Successfully issued ${rewardValue} tickets to user ${referrerRef.id}`);
    
  } catch (error) {
    if (error.code === 5 || error.message.includes('NOT_FOUND')) {
      console.error(`Referrer document ${referrerRef.id} does not exist. They may have deleted their account.`);
    } else {
      console.error("Critical error in referral reward system:", error);
    }
  }
});