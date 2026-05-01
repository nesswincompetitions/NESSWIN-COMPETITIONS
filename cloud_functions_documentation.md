# Cloud Functions Documentation

---

# Aggregate Order Metrics

## Name of the Cloud Function
`aggregateOrderMetrics`

## Overview
**Brief explanation of what the function does:**
Listens for changes to documents in the `order/{orderId}` collection. When an order transitions to the "Paid" status, it aggregates the total amount and tickets sold into daily and global system metrics.
**Business purpose (why it exists):**
Maintains real-time, highly efficient dashboards for financial and operational metrics without requiring expensive N+1 aggregation queries across the entire `order` collection.

## Function Details
* **Trigger type:** Firestore (`onDocumentWritten`)
* **Endpoint (if HTTP):** N/A
* **Method:** N/A
* **Required headers:** N/A

## Request Format
*This function is triggered automatically by Firestore events. There is no direct HTTP request format.*

## Response Format
*Event-driven function. Does not return an HTTP response.*

## Frontend Integration Guide
*No direct frontend integration required. Ensure the frontend creates/updates orders correctly; the trigger handles the rest.*

## Edge Cases & Error Handling
**Common failure scenarios:**
* The order updates multiple times.
**How frontend should handle them:**
* The backend inherently checks if the order *transitioned* to paid (`!wasPaid && isPaid`) to ensure idempotency. The frontend doesn't need to handle this.

## Security Notes
**Authentication/authorization requirements:** N/A (Backend Trigger)
**Any rate limiting or validation rules:** Triggered strictly on Firestore writes.

## Important Notes
* Updates `daily_metrics` and `system_metrics/global_stats` using `FieldValue.increment`.

---

# Process Referral Reward

## Name of the Cloud Function
`processReferralReward`

## Overview
**Brief explanation of what the function does:**
Listens for the creation of new documents in the `referrals/{referralId}` collection and automatically issues free tickets to the referring user.
**Business purpose (why it exists):**
Automates user acquisition rewards securely on the server-side to prevent client-side manipulation.

## Function Details
* **Trigger type:** Firestore (`onDocumentCreated`)
* **Endpoint (if HTTP):** N/A
* **Method:** N/A
* **Required headers:** N/A

## Request Format
*This function is triggered automatically by Firestore events.*

## Response Format
*Event-driven function.*

## Frontend Integration Guide
*No direct frontend integration. Ensure frontend passes referral codes on signup so the backend triggers document creation.*

## Edge Cases & Error Handling
**Common failure scenarios:**
* **Self-referral:** The user tries to refer themselves. Blocked automatically.
* **Deleted Referrer:** The referrer's account no longer exists.
**How frontend should handle them:**
* Silent to the frontend. The backend logs the error but does not disrupt the referred user's onboarding flow.

## Security Notes
**Authentication/authorization requirements:** N/A
**Any rate limiting or validation rules:**
* Uses atomic batches to update the referrer and mark the referral as `reward_issued: true` simultaneously.
* Validates that the referrer and referred user are not the same document path.

## Important Notes
* Highly idempotent: explicitly checks if `reward_issued` is already true before proceeding.

---

# Create Competition

## Name of the Cloud Function
`createCompetition`

## Overview
**Brief explanation of what the function does:**
Validates and saves competition data (including its skill-testing questions) to Firestore. It supports both creating new competitions and updating existing ones (including drafts).
**Business purpose (why it exists):**
Ensures tight validation of competition parameters (pricing, ticket counts, scheduling) and limits the number of questions to stay within Firestore transaction limits, preventing bad data from entering the database.

## Function Details
* **Trigger type:** HTTP Callable (Firebase `onCall`)
* **Endpoint:** (Handled automatically by Firebase SDK)
* **Method:** POST
* **Required headers:** 
  * `Authorization: Bearer <Firebase ID Token>`
  * `Content-Type: application/json`

## Request Format
**JSON body:**
```json
{
  "data": {
    "id": "comp_123", 
    "competitionData": {
      "title": "Summer Giveaway",
      "category": "Electronics",
      "ticket_price": 5.00,
      "total_tickets": 1000,
      "draw_date": 1714588200000
    },
    "questionsList": [
      {
        "question": "What is 2+2?",
        "option": [{ "option_id": 1, "option": "4" }, { "option_id": 2, "option": "5" }],
        "answer": { "option_id": 1 }
      }
    ],
    "is_draft": false
  }
}
```

**Field descriptions:**

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | String | No | ID of the competition. If null, a new competition is created. |
| `competitionData` | Object | Yes | Core details (title, price, draw_date, etc.). |
| `questionsList` | Array | No | Array of question objects. |
| `is_draft` | Boolean | Yes | Flag indicating if this is a draft. Bypasses strict validation if true. |

## Response Format
**Success response example:**
```json
{
  "result": {
    "success": true,
    "message": "Competition created securely!",
    "competitionId": "comp_abc123"
  }
}
```

**Error response example:**
```json
{
  "error": {
    "message": "Too many questions. Maximum allowed is 490.",
    "status": "OUT_OF_RANGE"
  }
}
```

## Frontend Integration Guide
**Step-by-step instructions for frontend developers:**
1. Collect form data and structure it exactly as requested.
2. Convert dates to timestamps (milliseconds).
3. Ensure users are logged in as an admin.

**Example API call:**
```javascript
import { getFunctions, httpsCallable } from "firebase/functions";
const createCompetition = httpsCallable(getFunctions(), 'createCompetition');

const result = await createCompetition({ id: null, competitionData: {...}, questionsList: [], is_draft: false });
```

**Required validations before calling the function:**
* Check that `total_tickets` > 0 and `ticket_price` >= 0.

## Edge Cases & Error Handling
**Common failure scenarios:**
* **Too Many Questions:** Max limit is 490 to respect Firestore batch limits (500 writes).
* **Time Travel:** Attempting to set a draw date in the past (minus a 12-hour buffer).
* **Missing Data:** Missing critical fields when not a draft.

## Security Notes
**Authentication/authorization requirements:**
* Requires valid auth token AND the user must have `role: "admin"` in Firestore.

---

# Verify Skill Answer

## Name of the Cloud Function
`verifySkillAnswer`

## Overview
**Brief explanation of what the function does:**
Validates the user's answer to a skill-testing question against the database, records the pass/fail outcome, and tracks the total number of attempts.
**Business purpose (why it exists):**
Acts as the legal "Skill Gate" before purchases. Ensures the answers cannot be manipulated on the client side, and maintains a strict audit log of user attempts.

## Function Details
* **Trigger type:** HTTP Callable (Firebase `onCall`)
* **Endpoint:** (Handled automatically by Firebase SDK)
* **Method:** POST
* **Required headers:** `Authorization: Bearer <Firebase ID Token>`

## Request Format
**JSON body:**
```json
{
  "data": {
    "competitionId": "comp_123",
    "questionId": "q_abc",
    "selectedOptionId": 2
  }
}
```

**Field descriptions:**

| Field | Type | Required | Description |
|---|---|---|---|
| `competitionId` | String | Yes | Competition ID. |
| `questionId` | String | Yes | Question ID. |
| `selectedOptionId` | String/Number | Yes | The ID of the option chosen by the user. |

## Response Format
**Success response example:**
```json
{
  "result": {
    "success": true
  }
}
```

## Frontend Integration Guide
**Step-by-step instructions for frontend developers:**
1. Display the question to the user.
2. On submit, call this function.
3. If `success` is true, proceed to checkout. If false, display an error and log the failed attempt on the UI.

## Edge Cases & Error Handling
**Common failure scenarios:**
* Question doesn't exist.
* User disconnected.

## Security Notes
**Authentication/authorization requirements:** Must be authenticated. Validates account is not suspended.

---

# Process Order

## Name of the Cloud Function
`processOrder`

## Overview
**Brief explanation of what the function does:**
This function acts as the "Zero-Trust Transaction Engine" for purchasing tickets to a competition. It performs server-side validation of a skill-testing question, calculates ticket prices including bulk discounts, ensures sufficient stock exists, and atomically generates order receipts, tickets, and bonus ticket logs within a single database transaction.

**Business purpose (why it exists):**
To ensure absolute integrity and security during the checkout process. By handling all validation, inventory checking, and price calculation on the server, it prevents race conditions (e.g., overselling tickets), unauthorized modifications to pricing, and ensures users cannot bypass the mandatory skill-testing question before purchase.

## Function Details
* **Trigger type:** HTTP Callable (Firebase `onCall`)
* **Endpoint:** (Handled automatically by Firebase SDK, typically `https://<region>-<project>.cloudfunctions.net/processOrder`)
* **Method:** POST (Implicit in Firebase Callable)
* **Required headers:** 
  * `Authorization: Bearer <Firebase ID Token>` (Handled automatically by the Firebase SDK)
  * `Content-Type: application/json`

## Request Format
**JSON body:**
```json
{
  "data": {
    "competitionId": "comp_12345",
    "ticketQuantity": 15,
    "questionId": "q_9876",
    "selectedOptionId": "opt_2"
  }
}
```

**Field descriptions:**

| Field | Type | Required | Description |
|---|---|---|---|
| `competitionId` | String | Yes | The unique ID of the competition being entered. |
| `ticketQuantity` | Number/String | Yes | The number of purchased tickets requested (must be a positive integer, max 100). |
| `questionId` | String | Yes | The ID of the skill-testing question presented to the user. |
| `selectedOptionId` | String/Number | Yes* | The ID of the user's selected answer. (*Not required if the user has previously passed this exact question). |

## Response Format
**Success response example:**
```json
{
  "result": {
    "success": true,
    "orderId": "abc123xyz",
    "tickets": [
      { "ticketId": "tkt_1", "ticketSequence": "TKT-00001" },
      { "ticketId": "tkt_2", "ticketSequence": "TKT-00002" }
    ],
    "totalAmount": 135.00,
    "packType": "Pack Prestige",
    "freeTickets": 1
  }
}
```

**Error response example:**
```json
{
  "error": {
    "message": "Out of stock. Only 5 ticket(s) remaining.",
    "status": "RESOURCE_EXHAUSTED",
    "details": null
  }
}
```

## Frontend Integration Guide
**Step-by-step instructions for frontend developers:**
1. Ensure the user is fully authenticated via Firebase Auth.
2. Present the skill-testing question to the user and capture their `selectedOptionId`.
3. Call the function using the Firebase Functions client SDK (`httpsCallable`).
4. Handle the response, checking for `success: true`. If successful, redirect the user to an order confirmation page using the returned `orderId`.

**Example API call (Firebase Client SDK):**
```javascript
import { getFunctions, httpsCallable } from "firebase/functions";

const functions = getFunctions();
const processOrder = httpsCallable(functions, 'processOrder');

try {
  const response = await processOrder({
    competitionId: "comp_12345",
    ticketQuantity: 15,
    questionId: "q_9876",
    selectedOptionId: "opt_2"
  });
  
  if (response.data.success) {
    console.log("Order successful!", response.data.orderId);
    // Redirect to confirmation
  }
} catch (error) {
  console.error("Order failed:", error.message);
}
```

**Required validations before calling the function:**
* Verify `ticketQuantity` is a positive integer > 0 and <= 100.
* Ensure an option is selected for the skill question (unless the frontend knows they previously passed).
* Prevent double-clicks by disabling the submit button while the request is pending.

## Edge Cases & Error Handling
**Common failure scenarios:**
* **Failed Skill Question:** If the user answers incorrectly, the function throws a `permission-denied` error ("Incorrect answer. You must pass the skill gate first.").
* **Out of Stock:** If the requested tickets exceed available stock, it throws a `resource-exhausted` error.
* **Competition Inactive:** Throws `failed-precondition` if the competition status is not "active".
* **Account Issues:** Throws `permission-denied` if the user's account is "deleted" or "suspended".

**How frontend should handle them:**
* Catch errors gracefully and display the `error.message` directly to the user (e.g., via a toast notification), as the backend messages are designed to be user-friendly.
* On a failed skill question, reset the form and potentially prompt them to try again (or lock them out based on specific frontend rules).

## Security Notes
**Authentication/authorization requirements:**
* The function mandates a valid Firebase Auth token. Unauthenticated requests will immediately fail.
* Validates that the requesting user's account status is not marked as `deleted` or `suspended` in Firestore.

**Any rate limiting or validation rules:**
* Hard limit of 100 tickets per transaction.
* Skill attempt outcomes are securely logged in a separate `skill_attempts` collection.
* All ticket generation, discount calculations, and stock decrements occur inside a strictly locked Firestore Transaction to prevent race conditions.

## Important Notes
* **Idempotency:** The frontend should ideally disable the submission button upon clicking. Although the function runs as a transaction, repeated simultaneous calls could result in multiple charges if stock permits.
* **Pricing Logic:** Bulk discount logic (e.g., 15 tickets = 10% off + 1 free ticket) is hardcoded into this function. Any changes to the "Packs" must be updated here.
* **Free Tickets:** Bonus tickets are calculated based on tier thresholds and added *on top* of the requested quantity. Stock checking accounts for `qty + freeTickets`.

---

# Soft Delete User

## Name of the Cloud Function
`softDeleteUser`

## Overview
**Brief explanation of what the function does:**
Permanently disables a user's Firebase Authentication account, revokes all active session tokens to kick them out instantly, and marks their Firestore document status as `deleted`.
**Business purpose (why it exists):**
Provides admins with a robust ban/removal tool that severs the user's access immediately, while retaining their order history for auditing and financial reporting.

## Function Details
* **Trigger type:** HTTP Callable (Firebase `onCall`)
* **Endpoint:** (Handled automatically by Firebase SDK)
* **Method:** POST
* **Required headers:** `Authorization: Bearer <Firebase ID Token>`

## Request Format
**JSON body:**
```json
{
  "data": {
    "userId": "user_123abc"
  }
}
```

**Field descriptions:**

| Field | Type | Required | Description |
|---|---|---|---|
| `userId` | String | Yes | The ID of the user to be banned/deleted. |

## Response Format
**Success response example:**
```json
{
  "result": {
    "success": true,
    "message": "User user_123abc has been soft deleted successfully."
  }
}
```

## Frontend Integration Guide
**Step-by-step instructions for frontend developers:**
1. Ensure the caller is logged in as an admin.
2. Provide a confirmation dialog (e.g., "Are you sure?") before calling.

**Example API call:**
```javascript
const softDeleteUser = httpsCallable(getFunctions(), 'softDeleteUser');
await softDeleteUser({ userId: "some_uid" });
```

## Edge Cases & Error Handling
**Common failure scenarios:**
* Target user doesn't exist in Auth. Function throws `not-found`.

## Security Notes
**Authentication/authorization requirements:** Requires `role: "admin"`.

---

# Soft Delete Competition

## Name of the Cloud Function
`softDeleteCompetition`

## Overview
**Brief explanation of what the function does:**
Updates a competition's status to `deleted` and sets an updated timestamp.
**Business purpose (why it exists):**
Hides a competition from public view without destroying the associated tickets and orders, ensuring database relational integrity.

## Function Details
* **Trigger type:** HTTP Callable (Firebase `onCall`)
* **Endpoint:** (Handled automatically by Firebase SDK)
* **Method:** POST
* **Required headers:** `Authorization: Bearer <Firebase ID Token>`

## Request Format
**JSON body:**
```json
{
  "data": {
    "id": "comp_abc"
  }
}
```

## Response Format
**Success response example:**
```json
{
  "result": {
    "success": true,
    "message": "Competition deleted successfully."
  }
}
```

## Security Notes
**Authentication/authorization requirements:** Requires `role: "admin"`.

---

# Aggregate User Metrics

## Name of the Cloud Function
`aggregateUserMetrics`

## Overview
**Brief explanation of what the function does:**
Listens for updates to user documents. If a user's `is_verified` status changes to `true`, it increments the `daily_new_users` and `total_registered_users` system metrics.
**Business purpose (why it exists):**
Provides efficient tracking of real, verified user growth over time for dashboard analytics.

## Function Details
* **Trigger type:** Firestore (`onDocumentUpdated`)
* **Endpoint (if HTTP):** N/A
* **Method:** N/A

## Request/Response Format
*Event-driven function. No HTTP request/response.*

## Security Notes
**Authentication/authorization requirements:** N/A (Backend Trigger).
