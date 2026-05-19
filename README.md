# NESSWIN

NESSWIN is a premium, high-performance raffle and competition platform. Built with a modern dark-themed aesthetic, it offers users an elite experience when purchasing tickets, tracking live draws, and claiming rewards.

## 🚀 Tech Stack

- **Frontend Framework:** React 18
- **Build Tool:** Vite
- **Styling & UI:** Tailwind CSS, Lucide Icons
- **Animations:** Framer Motion (GPU-Optimized)
- **Backend & Database:** Firebase (Authentication, Firestore, Storage, Cloud Functions)
- **Deployment:** Vercel

## ✨ Key Features

- **Real-Time Competitions:** Sub-second data synchronization and live Countdown timers powered by Firestore.
- **Optimized Performance:** Aggressive code-splitting, route-based lazy loading, and granular vendor chunking for near-instant page loads.
- **Premium Animations:** Hardware-accelerated (GPU) Framer Motion transitions using custom tween Bezier curves (`ease-out-expo`) for a silky smooth 60fps experience.
- **Secure Ticketing Flow:** Smart checkout with referral rewards, dynamic pack sizing, and skill-gated verification questions.
- **Robust Admin Dashboard:** Full CRUD management for users, competitions, and tickets.
- **Offline Persistence:** Firestore IndexedDB local caching guarantees instantaneous UI rendering on repeat visits.

## 🛠️ Project Structure

The codebase follows a modular, feature-based architecture for scalability and ease of maintenance:

```text
src/
├── contexts/         # Global state (UserContext, ThemeContext)
├── modules/          # Feature domains
│   ├── admin/        # Admin dashboard and management modules
│   └── user/         # User-facing features (competitions, profile, checkout)
├── routes/           # Application routing (Code-split with React.lazy)
├── shared/           # Reusable components, hooks, and utilities
└── config/           # Environment and Firebase configurations
```

## 🏎️ Performance Optimizations

This project has been heavily audited and optimized for production:
- **Vercel Caching:** `vercel.json` headers ensure immutable caching for all hashed `/assets`.
- **Vite Chunking:** Heavy libraries (`firebase`, `framer-motion`, `react`) are separated from the main bundle.
- **GPU Hinting:** Strategic use of `will-change: transform, opacity` and `transform-gpu` to prevent main-thread layout thrashing during DOM transitions.

## 💻 Local Development

### Prerequisites
- Node.js (v18 or higher)
- npm or yarn

### Setup

1. **Clone the repository and install dependencies:**
   ```bash
   npm install
   ```

2. **Environment Variables:**
   Create a `.env` file in the root directory and add your Firebase configuration credentials.
   ```env
   VITE_FIREBASE_API_KEY=your_api_key
   VITE_FIREBASE_AUTH_DOMAIN=your_auth_domain
   VITE_FIREBASE_PROJECT_ID=your_project_id
   VITE_FIREBASE_STORAGE_BUCKET=your_storage_bucket
   VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   VITE_FIREBASE_APP_ID=your_app_id
   ```

3. **Start the development server:**
   ```bash
   npm run dev
   ```

4. **Build for production:**
   ```bash
   npm run build
   ```

## 📜 License
Proprietary software. All rights reserved.
