# NESSWIN Technical Documentation

## Project Overview
**Project Name:** NESSWIN
**Purpose:** A premium, high-performance raffle and competition platform where users can purchase tickets, participate in competitions with skill-based entry gates, and win prizes.
**Main Objectives:**
- Provide a secure, fair, and transparent competition experience.
- Offer an elite, production-grade interface with fluid animations and real-time updates.
- Empower administrators with a comprehensive dashboard to manage competitions, users, orders, and support tickets.
**Target Users:** 
- Participants looking to enter exclusive raffles and competitions globally (supported by multi-language).
- Platform administrators managing draws, user data, ticket allocations, and support channels.

---

## Tech Stack
**Frontend:**
- **React 19:** Core UI library leveraging concurrent rendering features.
- **Vite:** Next-generation frontend tooling for ultra-fast HMR and optimized production builds.
- **React Router v7:** Client-side routing with lazy loading and protected route management.
- **Tailwind CSS v4:** Utility-first CSS framework for rapid UI development and custom dark mode styling.
- **Framer Motion:** High-performance animation library handling GPU-accelerated micro-interactions and page transitions.
- **@tanstack/react-query:** Robust server state management, caching, and data fetching synchronization.

**Backend (Firebase Ecosystem):**
- **Firebase Authentication:** Handles user identity, signup, and login.
- **Firebase Firestore:** Real-time NoSQL database for syncing competitions, chats, and user data.
- **Firebase Cloud Functions:** Node.js serverless backend handling complex business logic.
- **Firebase Cloud Storage:** Secure file storage for competition imagery.
- **Firebase Cloud Tasks:** Deferred/scheduled task execution for automated draws.

---

## System Architecture
**Frontend Architecture:**
The frontend follows a highly modular, feature-slice design. Core domains (users, competitions, admin) are isolated in `src/modules`. Shared logic resides in `src/shared`.

**Firebase Backend Structure:**
The backend is completely serverless. Clients interact directly with Firestore for read-heavy operations, governed by strict Firebase Security Rules. All mutations that require secure validation, financial integrity, or automated scheduling are delegated to **Firebase Cloud Functions**.

---

## Enterprise Architectural Patterns

To ensure NESSWIN scales securely and cost-effectively, the following advanced, production-grade architectural strategies are enforced:

### 1. Cursor-Based Pagination Strategy
Because Firestore charges per document read, traditional offset-based pagination (e.g., `LIMIT 10 OFFSET 100`) is strictly prohibited as it still reads and bills for all offset documents. 
- **Implementation:** All list views (competitions, users, orders) utilize **Cursor-Based Pagination** using Firestore's `startAfter()` or `startAt()`.
- **How it works:** The client stores the last document snapshot of the current page and passes it to the next query. This guarantees $O(1)$ query cost per page load, drastically reducing database billing and improving query speed.

### 2. Cost-Optimization & Query Batching (N+1 Query Resolution)
To eliminate "N+1 Query" performance bottlenecks—especially in the admin dashboard where multiple related documents (users, tickets, competitions) must be fetched simultaneously—sequential network requests are prohibited.
- **Implementation:** The codebase employs parallel promise batching using `Promise.all()` (and `Promise.allSettled()` for fault tolerance).
- **How it works:** Instead of waiting for a competition to load, then its tickets, then its users in sequence, all independent read operations are parallelized. This reduces network waterfall delays and dramatically decreases load times for complex data structures like completed competitions.

### 3. Dual-Panel Caching Rules
NESSWIN features both a high-traffic public user interface and a sensitive admin dashboard. Caching data universally across both would lead to security risks and stale administrative views.
- **Implementation:** We enforce a strict **Dual-Panel Caching Strategy** using `@tanstack/react-query`.
- **How it works:**
  - **User Panel Caching:** Heavily cached with high `staleTime`. Public competition data and generic configurations are cached aggressively to minimize Firestore reads from the public user base.
  - **Admin Panel Caching:** Caching is strictly limited or configured with a `staleTime` of `0` for critical mutations. The admin dashboard requires absolute, real-time ground truth. For aggregated metrics, the UI forces cache invalidation immediately upon any administrative mutation to ensure no stale data is ever acted upon.

---

## Folder Structure
```text
nesswin/
├── functions/                # Serverless Backend Logic
│   ├── controllers/          # Grouped Cloud Functions (orders, winners, tasks)
│   ├── services/             # Firebase Admin SDK interactions
│   └── index.js              # Cloud Functions exported entry point
├── src/
│   ├── assets/               # Local static assets (images, fonts)
│   ├── config/               # App configuration (Firebase init, query client)
│   ├── contexts/             # Global Context Providers (UserContext, AuthContext)
│   ├── hooks/                # Global React hooks
│   ├── locales/              # i18n JSON translation files
│   ├── modules/              # Core business logic divided by domains
│   │   ├── admin/            # Admin workflows (competitions, dashboard, users, support)
│   │   └── user/             # User workflows (competitions, profile, auth)
│   ├── routes/               # Application routing wrappers
│   ├── shared/               # Code shared across modules
│   │   ├── components/       # Dumb UI components
│   │   ├── services/         # Firebase Client API wrappers
│   │   └── utils/            # Helper functions
│   ├── App.jsx               # Root component with routing
│   └── main.jsx              # React DOM entry point
├── firebase.json             # Firebase deployment configuration
├── firestore.indexes.json    # Composite index definitions for Firestore queries
└── vercel.json               # Vercel deployment configuration
```

---

## Features & Detailed Cloud Function Flows

The system relies heavily on Firebase Cloud Functions to enforce security, automate workflows, and maintain data integrity. Below is a detailed breakdown of all system flows and their respective Cloud Functions.

### 1. Order & Ticketing Flow
Manages the end-to-end lifecycle of purchasing tickets securely.
- **`initiateOrder` (Callable):** The client invokes this to start a purchase. The function validates ticket availability, checks the user's wallet/balance, verifies competition status, and temporarily locks the requested tickets.
- **`processOrder` (Callable):** Once payment is authorized, this function finalizes the transaction. It allocates specific, randomized ticket numbers to the user, deducts balances, and finalizes the order document in Firestore.
- **`paymentPendingWorker` (Cloud Task):** A delayed task that monitors initiated orders. If an order stays pending beyond a timeout, it releases the locked tickets back to the pool.
- **`refundOrder` (Callable/Admin):** Triggered by an admin to safely reverse an order, free up the allocated tickets, and credit the user.

### 2. Skill Gate Flow
Complies with legal guidelines for raffles by ensuring users pass a skill-based test before purchasing.
- **`getSkillQuestion` (Callable):** The client requests a question. The function retrieves a random question from the database but **strips out the correct answer** before sending it to the client.
- **`submitSkillAnswer` (Callable):** The user submits their answer. The function compares it against the secure backend record. If correct, it flags the user's session as authorized to enter the specific competition.

### 3. Automated Competition Draw Flow
Handles the scheduling and automated closure of competitions.
- **`scheduleCompetitionDrawOnCreate` & `scheduleCompetitionDrawOnUpdate` (Firestore Triggers):** When an admin creates or updates a competition with a specific `drawDate`, these triggers generate a precise Firebase Cloud Task scheduled for that exact timestamp.
- **`drawWorker` (Cloud Task):** At the scheduled time, this function executes. It immediately changes the competition status to `drawing`, locks the competition, and halts all further ticket sales across the platform.
- **`cancelCompetitionDrawOnDelete` (Firestore Trigger):** If an admin deletes a draft competition, this trigger intercepts and cancels the pending Cloud Task to prevent ghost executions.

### 4. Winner Selection & Handover Flow
Ensures cryptographic fairness when picking winners and managing prize delivery.
- **`selectCompetitionWinner` (Callable):** Executed by an admin or triggered automatically after `drawWorker`. It aggregates all valid sold tickets, utilizes a secure random number generator to pick the winning ticket, and assigns the winner to the competition document.
- **`notifyWinnerOnFirstAdminMessage` (Firestore Trigger):** Listens to the `chats` collection. When an admin sends the first message to the winner regarding their prize, this triggers an automated email/SMS notification to alert the user.
- **`updateCompetitionHandover` (Callable/Admin):** Logs the formal handover of the physical or digital prize, marking the competition lifecycle as 100% complete.

### 5. Admin Dashboard & Metrics Flow
Prevents expensive $O(N)$ database queries by aggregating data in real-time.
- **Event Triggers (`onCompetitionCreatedDashboard`, `onCompetitionChangeDashboard`, `onCompetitionDeletedDashboard`, `onUserChangeDashboard`, `onUserDeletedDashboard`, `onOrderDeletedDashboard`, `onChatCreatedDashboard`, `onChatUpdatedDashboard`):** Every time a document is mutated, these lightweight triggers increment or decrement counters on a centralized `dashboard_metrics` document. 
- **`syncDashboardMetrics` & `syncDashboardMetricsScheduled` (Cron/Callable):** Nightly or manually invoked jobs that perform a deep recount of the database to rectify any discrepancies in the metrics caused by race conditions.
- **`onDayChangeSync` (Cron):** Rolls over daily revenue and active user metrics to create historical charting data.

### 6. User Management, Bonuses & Referrals Flow
- **Referral Capture (Frontend):** Users share links with `?ref=CODE`. `App.jsx` intercepts this and stores it in `localStorage`. Upon signup, this code is passed to the backend.
- **`grantAdminBonus` (Callable/Admin):** Admins use this to manually credit users with bonus tickets or balance (used heavily to fulfill referral rewards).
- **`softDeleteUser` (Callable):** When a user requests account deletion, this function anonymizes their PII (Personally Identifiable Information) but leaves the underlying UID and past ticket records intact to preserve historical competition integrity.

### 7. Notification Flow
- **`onCompetitionStatusUpdate` (Firestore Trigger):** Monitors competitions. When statuses change (e.g., `upcoming` -> `live`, or `live` -> `drawn`), it dispatches platform-wide notifications or hooks into external marketing tools (like Mailchimp or SendGrid).

---

## Database Design

### Collections
1. **`users`**: Profiles, balances, roles (`admin` or `user`), and unique referral codes.
2. **`competitions`**: Raffle configurations (title, price, max tickets, draw date, status, prize).
3. **`tickets`**: Individual ticket allocations containing ticket numbers, linked to a UID and competition ID.
4. **`orders`**: Transaction records.
5. **`chats` & `messages`**: Support threads and messages (Collection Group setup).
6. **`dashboard_metrics`**: Aggregated performance counters.

---

## Authentication Flow
1. **Signup/Login:** User enters credentials via the UI.
2. **Firebase Auth:** Processes the request (Email/Pass, Google OAuth) and issues a secure JWT.
3. **Session:** `AuthContext` listens to `onAuthStateChanged`. The client fetches the extended user profile from Firestore (`users/{uid}`).
4. **Protected Routes:** `ProtectedRoute.jsx` blocks unauthorized access. Admin routes require `role === 'admin'` on the user document.

---

## Routing Structure
**Public Routes:** `/`, `/competitions`, `/competitions/:id`, `/winners`, `/how-it-works`, `/terms`, `/privacy`, `/rules`
**Auth Routes:** `/signin`, `/signup`, `/forgot-password` (Redirects to `/` if logged in)
**Protected User Routes:** `/profile`, `/profile/tickets`, `/profile/orders`, `/profile/support`
**Protected Admin Routes (`/admin/*`):** `/admin/dashboard`, `/admin/competitions`, `/admin/winners`, `/admin/users`, `/admin/orders`

---

## UI Components Documentation
Reusable components in `src/shared/components/`:
- **Cards:** For displaying competition grids.
- **Modals/Dialogs:** Framer Motion animated overlays for skill gates and confirmations.
- **Forms:** Controlled inputs utilizing standard validation.
- **Buttons:** Dynamic states (loading, disabled).

---

## Performance Optimization
- **Lazy Loading:** All routes in `App.jsx` use `React.lazy()` for route-based code splitting.
- **Caching:** `@tanstack/react-query` heavily caches server state to prevent redundant Firestore reads.
- **GPU Acceleration:** `framer-motion` utilizes `transform-gpu` to offload animations from the main thread.
- **Image Optimization:** `browser-image-compression` shrinks image uploads client-side before sending to Cloud Storage.

---

## Security Implementation
- **Cloud Functions:** All critical financial, draw, and validation logic runs securely on the backend. The client cannot forge a ticket purchase.
- **Firestore Rules:** `firestore.rules` enforces that users only read/write their own nested collections, while admins have unrestricted global read/write.
- **Data Validation:** Cloud functions use strict schema validation before processing any `data` payload.

---

## Deployment Guide
The app is configured for Vercel (Frontend) and Firebase (Backend).

1. **Frontend (Vercel):**
   - Push to GitHub. Connect repository to Vercel.
   - Add all `VITE_FIREBASE_*` variables in Vercel.
   - Vercel automatically utilizes `vercel.json` for routing rewrites and cache control.
   
2. **Backend (Firebase):**
   - Install CLI: `npm i -g firebase-tools`
   - Login: `firebase login`
   - Select project: `firebase use <project-id>`
   - Deploy functions: `firebase deploy --only functions`
   - Deploy DB rules/indexes: `firebase deploy --only firestore`

---

## Installation & Setup

1. **Clone & Install:**
```bash
git clone <repo-url>
cd nesswin
npm install
```

2. **Environment Variables:**
Create `.env`:
```env
VITE_FIREBASE_API_KEY="your-key"
VITE_FIREBASE_AUTH_DOMAIN="your-domain"
VITE_FIREBASE_PROJECT_ID="your-project"
VITE_FIREBASE_STORAGE_BUCKET="your-bucket"
VITE_FIREBASE_MESSAGING_SENDER_ID="your-sender-id"
VITE_FIREBASE_APP_ID="your-app-id"
```

3. **Run Dev Server:**
```bash
npm run dev
```

---

## Troubleshooting Guide
- **Blank Screen on Load:** Missing or malformed `.env` variables causing Firebase init to crash.
- **CORS Errors on Images:** Ensure Firebase Storage CORS rules (`storage-cors.json`) are applied via `gsutil cors set storage-cors.json gs://<your-bucket>`.
- **Missing Index Errors:** Firebase console will provide a direct link in the browser console. Click it to generate the composite index, or deploy `firestore.indexes.json`.
- **Cloud Functions Failing:** Ensure you are using Node 18/20. Check Firebase Console logs for execution errors.
