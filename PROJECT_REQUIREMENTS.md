# NESSWIN Project Requirements Document (PRD) / Software Requirements Specification (SRS)

## 1. Introduction

### 1.1 Purpose
This document outlines the software requirements for **NESSWIN**, a premium, high-performance raffle and competition platform. It serves as a comprehensive guide for developers, project managers, and stakeholders to understand the system's functional capabilities, architectural constraints, and non-functional requirements.

### 1.2 Scope
NESSWIN provides users with the ability to purchase tickets and participate in exclusive competitions, governed by skill-based entry gates to comply with legal raffle frameworks. The platform includes a robust administrative panel for managing competitions, ticketing, users, orders, and customer support. 

### 1.3 Target Audience
- **End-Users (Participants):** Global users seeking to enter exclusive skill-based raffles and competitions.
- **Administrators:** Platform managers overseeing draws, customer support, user management, and overall system health.

---

## 2. Overall Description

### 2.1 Product Perspective
NESSWIN is a web-based application utilizing a modern serverless architecture. The client-side is built with React 19 and Vite, ensuring high performance and fluid animations. The backend relies entirely on the Firebase Ecosystem (Firestore, Cloud Functions, Authentication, Storage, and Tasks) to handle secure financial transactions, automated scheduling, and real-time data synchronization.

### 2.2 User Classes & Roles
- **Guest Users:** Can view active competitions, browse rules, terms, and how the platform works. Cannot purchase tickets.
- **Registered Users:** Can view profile, manage wallet balances, participate in skill gates, purchase tickets, view order history, and contact support.
- **Administrators (`role === 'admin'`):** Have unrestricted global access to the admin dashboard, user metrics, competition management (create, update, delete, schedule draws), winner selection, and order processing/refunding.

### 2.3 Operating Environment
- **Client Web Application:** Modern web browsers (Chrome, Safari, Firefox, Edge). Highly responsive and optimized for both desktop and mobile views.
- **Backend Infrastructure:** Firebase Serverless Architecture (Node.js runtime for Cloud Functions, Firestore NoSQL database).

---

## 3. System Features & Functional Requirements

### 3.1 User Authentication & Profile Management
- **REQ-AUTH-01:** The system shall support secure User Registration and Login using Email/Password and Google OAuth providers.
- **REQ-AUTH-02:** The system shall maintain session state securely using Firebase Authentication JWTs.
- **REQ-USER-01:** Users shall have a profile dashboard to view their wallet balance, active tickets, and historical orders.
- **REQ-USER-02:** Users shall be able to request an account deletion (soft delete), anonymizing Personal Identifiable Information (PII) while preserving historical ticket ledger data for system integrity.
- **REQ-REF-01:** The system shall support a referral program where new users can sign up using a referral code (`?ref=CODE`), which is tracked and securely validated by the backend.

### 3.2 Competition & Ticketing Engine
- **REQ-COMP-01:** Admins shall be able to create, update, and manage competitions with metadata including Title, Price, Maximum Tickets, Draw Date, and Prize Details.
- **REQ-TICK-01:** The system shall enforce a highly secure ticket purchasing flow. When an order is initiated, requested tickets must be temporarily locked to prevent double-booking.
- **REQ-TICK-02:** Upon successful payment authorization, the system shall allocate randomized ticket numbers to the user and deduct the respective wallet balance.
- **REQ-TICK-03:** If an order remains pending beyond a configured timeout, a background worker shall automatically release the locked tickets back to the available pool.

### 3.3 Skill-Based Entry Gate
- **REQ-SKILL-01:** To comply with raffle regulations, users must pass a skill-based test before purchasing a ticket.
- **REQ-SKILL-02:** The system shall fetch a random skill question from the database, strictly ensuring the correct answer is stripped from the payload sent to the client.
- **REQ-SKILL-03:** User answers shall be securely evaluated by a Cloud Function. Only upon successful validation will the user's session be authorized to purchase tickets for that specific competition.

### 3.4 Automated Draw & Winner Selection
- **REQ-DRAW-01:** The system shall utilize Firebase Cloud Tasks to schedule automated competition closures exactly at the predefined Draw Date timestamp.
- **REQ-DRAW-02:** The automated draw worker must lock the competition, change its status to `drawing`, and halt all subsequent ticket sales platform-wide.
- **REQ-DRAW-03:** Winner selection shall be executed via a secure Cloud Function using a cryptographically secure random number generator to select the winning ticket from the pool of valid sold tickets.
- **REQ-DRAW-04:** Admins shall have the capability to manually mark a prize as "Handed Over," fully closing the competition lifecycle.

### 3.5 Administrator Dashboard & Metrics
- **REQ-ADM-01:** The admin dashboard shall display real-time, aggregated metrics (total revenue, active users, tickets sold, etc.) without performing costly $O(N)$ database queries.
- **REQ-ADM-02:** The system shall use lightweight database triggers to increment/decrement a centralized `dashboard_metrics` document on every relevant state change.
- **REQ-ADM-03:** The system shall run a nightly cron job to reconcile and sync dashboard metrics, rectifying any discrepancies caused by race conditions.
- **REQ-ADM-04:** Admins shall be able to grant bonus wallet balance or tickets to specific users (e.g., fulfilling referral rewards).
- **REQ-ADM-05:** Admins shall be able to view, manage, and refund specific user orders.

### 3.6 Support & Notifications
- **REQ-SUPP-01:** The system shall feature an integrated chat/support ticket system utilizing Firestore Collection Groups for real-time messaging between users and admins.
- **REQ-NOTF-01:** The system shall trigger automated email/SMS notifications to the winning user upon the first administrative message sent regarding their prize.
- **REQ-NOTF-02:** The system shall dispatch platform-wide alerts when a competition status transitions (e.g., from `live` to `drawn`).

---

## 4. Data Requirements & Database Schema Overview

The system utilizes Firebase Firestore (NoSQL). Below are the core collections:

- **`users`**: Stores user profiles, roles, balances, and unique referral codes.
- **`competitions`**: Stores raffle configuration, current status, draw dates, and prize info.
- **`tickets`**: Stores individual ticket allocations, linking ticket numbers to a specific `competitionId` and `userId`.
- **`orders`**: Immutable ledger of financial transactions and ticket purchases.
- **`chats` & `messages`**: Customer support threads structured to support real-time snapshot listeners.
- **`dashboard_metrics`**: A centralized document storing aggregated platform performance counters.

---

## 5. Non-Functional Requirements (NFRs)

### 5.1 Performance & Scalability
- **Frontend Optimization:** The UI must employ React code-splitting and lazy-loading to ensure sub-second initial page loads.
- **State Caching:** The system shall utilize `@tanstack/react-query` to aggressively cache server state, reducing redundant database reads and bandwidth consumption.
- **Animations:** All micro-interactions and page transitions (via Framer Motion) must utilize GPU-acceleration to maintain a stable 60 FPS.
- **Database Scalability:** The database must be designed to avoid $O(N)$ queries on the client side, relying strictly on paginated queries and aggregated counters for metrics.

### 5.2 Security & Compliance
- **Server-Side Validation:** All financial transactions, ticket generation, and draw logic MUST execute in a trusted server environment (Firebase Cloud Functions). The client must never dictate ticket allocation.
- **Database Rules:** Strict Firestore Security Rules must be implemented to ensure users can only read/write their own nested collections, while restricting global mutation access exclusively to authenticated Administrators.
- **Data Integrity:** Cloud Functions must employ strict schema validation (e.g., checking data types, balance limits) before mutating the database.

### 5.3 Availability & Reliability
- The application relies on Firebase's global CDN and serverless infrastructure, targeting an uptime SLA of 99.9%.
- Automated rollback mechanisms (via Cloud Tasks monitoring) must be in place to free locked resources in the event of abandoned or failed payment flows.

---

## 6. User Interface & UX Guidelines
- **Premium Aesthetics:** The interface must feature a modern, dark-mode default design utilizing Tailwind CSS.
- **Responsiveness:** Components must be fluid and functional across desktop, tablet, and mobile breakpoints.
- **Feedback:** Users must receive immediate visual feedback (loading spinners, toast notifications, disabled button states) for all asynchronous operations.

---

## 7. Development & Deployment
- **Frontend Hosting:** Vercel (Auto-deployment on GitHub push).
- **Backend Hosting:** Firebase Functions & Firestore.
- **Version Control:** Git/GitHub utilizing feature-branch workflows.
- **Environment Management:** Strict separation of environment variables (`VITE_FIREBASE_*`) for local development, staging, and production environments.
