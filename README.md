<div align="center">
  <br />
  <h1>🏆 NESSWIN</h1>
  <p>
    <strong>A Premium, High-Performance Raffle & Competition Platform</strong>
  </p>
  <p>
    <a href="#features">Features</a> •
    <a href="#tech-stack">Tech Stack</a> •
    <a href="#architecture">Architecture</a> •
    <a href="#getting-started">Getting Started</a>
  </p>
  <br />
</div>

## 🌟 Overview

**NESSWIN** is an elite, production-grade raffle and competition platform engineered for scale, performance, and an unmatched user experience. Designed with a modern, sleek dark-themed aesthetic, it provides users with a seamless interface for purchasing tickets, tracking live draws, claiming rewards, and engaging with real-time competitions. 

The platform is architected with modern web technologies to ensure sub-second interactions, resilient offline capabilities, and buttery-smooth hardware-accelerated animations.

---

## ✨ Key Features

- ⚡ **Real-Time Synchronization:** Powered by Firestore, enabling live countdown timers, instant ticket updates, and real-time competition statuses without page reloads.
- 🎨 **Premium User Interface:** A highly polished dark mode UI built with Tailwind CSS, featuring glassmorphism elements, vibrant gradients, and curated typography.
- 🎬 **Fluid 60FPS Animations:** GPU-optimized micro-interactions and page transitions utilizing Framer Motion with custom Bezier curves (`ease-out-expo`).
- 🛒 **Smart Checkout & Ticketing:** Secure, frictionless checkout flows including dynamic ticket pack sizing, referral rewards, and skill-gated verification layers.
- 🌍 **Internationalization (i18n):** Multi-language support seamlessly integrated across the platform (English, French, Spanish, and more) to serve a global audience.
- 🛡️ **Robust Admin Dashboard:** A comprehensive management portal for administrators to control users, orchestrate competitions, manage tickets, and analyze platform metrics.
- 📴 **Offline Persistence:** Intelligent local caching via IndexedDB ensures instant UI rendering on repeat visits and resilience against network instability.
- 🚀 **Extreme Performance:** Aggressive code-splitting, granular vendor chunking, route-based lazy loading, and optimized asset delivery for near-instant Time to Interactive (TTI).

---

## 🛠️ Tech Stack

### Frontend Architecture
- **Framework:** [React 19](https://react.dev/)
- **Build Engine:** [Vite](https://vitejs.dev/)
- **Routing:** [React Router v7](https://reactrouter.com/)
- **Styling:** [Tailwind CSS v4](https://tailwindcss.com/)
- **Animations:** [Framer Motion](https://www.framer.com/motion/)
- **Icons:** [Lucide React](https://lucide.dev/) & [React Icons](https://react-icons.github.io/react-icons/)
- **Internationalization:** [i18next](https://www.i18next.com/) & `react-i18next`
- **Notifications:** [React Hot Toast](https://react-hot-toast.com/)

### Backend & Infrastructure
- **Database:** Firebase Firestore (Real-time NoSQL)
- **Authentication:** Firebase Auth
- **Storage:** Firebase Cloud Storage
- **Functions:** Firebase Cloud Functions (Serverless logic)
- **Deployment & Edge Network:** [Vercel](https://vercel.com/)

---

## 🏗️ Project Architecture

The codebase adheres to a strict, modular feature-based architecture. This ensures high maintainability, isolated testing, and scalable code-splitting.

```text
nesswin/
├── src/
│   ├── components/       # Shared, dumb UI components (buttons, inputs, modals)
│   ├── config/           # Environment variables and Firebase initialization
│   ├── contexts/         # Global React contexts (Auth, Theme, etc.)
│   ├── hooks/            # Reusable custom React hooks
│   ├── locales/          # i18n translation files (en, es, fr, etc.)
│   ├── modules/          # Core domain features
│   │   ├── admin/        # Admin dashboard, competition management
│   │   └── user/         # Public-facing features (competitions, profile, checkout)
│   ├── routes/           # Application routing and layout wrappers
│   ├── services/         # API clients and Firebase interaction layers
│   └── utils/            # Helper functions and formatters
├── public/               # Static assets (fonts, icons, raw images)
└── functions/            # Firebase Cloud Functions backend logic
```

---

## 🏎️ Performance Optimizations

NESSWIN is relentlessly optimized for production:

1. **Intelligent Chunking:** Vite configuration explicitly separates heavy dependencies (`firebase`, `react`, `framer-motion`) from application code.
2. **GPU Hinting:** Strategic application of `will-change: transform, opacity` and `transform-gpu` to offload rendering to the GPU and eliminate main-thread jank.
3. **Aggressive Caching:** Configured `vercel.json` to enforce immutable cache headers for hashed static assets, maximizing CDN hit rates.
4. **Image Compression:** On-the-fly client-side image compression (`browser-image-compression`) before uploading to Firebase Storage to minimize bandwidth and storage costs.

---

## 💻 Getting Started

Follow these instructions to set up the project locally.

### Prerequisites

- **Node.js**: `v18.x` or higher
- **Package Manager**: `npm` (or `yarn`/`pnpm`)
- **Firebase Project**: An active Firebase project with Auth, Firestore, and Storage enabled.

### 1. Clone the Repository

```bash
git clone <repository-url>
cd nesswin
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Environment Configuration

Create a `.env` file in the root of the project and populate it with your Firebase project credentials.

```env
VITE_FIREBASE_API_KEY="your-api-key"
VITE_FIREBASE_AUTH_DOMAIN="your-project-id.firebaseapp.com"
VITE_FIREBASE_PROJECT_ID="your-project-id"
VITE_FIREBASE_STORAGE_BUCKET="your-project-id.appspot.com"
VITE_FIREBASE_MESSAGING_SENDER_ID="your-messaging-sender-id"
VITE_FIREBASE_APP_ID="your-app-id"
```

### 4. Start the Development Server

```bash
npm run dev
```

The application will be available at `http://localhost:5173`.

---

## 📦 Build & Deployment

### Production Build

To generate an optimized production build:

```bash
npm run build
```

This will output the compiled application into the `dist/` directory, ready to be served by any static file server.

### Deploying to Vercel

This project is configured out-of-the-box for seamless Vercel deployment.

1. Connect your repository to Vercel.
2. Add your `.env` variables in the Vercel project settings.
3. Vercel will automatically detect the Vite framework and build the project using `npm run build`.

---

## 📜 License

**Proprietary Software.** All rights reserved.  
Unauthorized copying, modification, distribution, or use of this software, via any medium, is strictly prohibited.
