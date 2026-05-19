import React from 'react';
import { Route } from 'react-router-dom';
import { ProtectedRoute, AuthRoute } from './ProtectedRoute.jsx';
import UserLayout from '@/shared/layouts/UserLayout';

import Home from '@/modules/user/home/pages/Home';
const SignupPage = React.lazy(() => import('@/modules/user/auth/pages/SignupPage'));
const ForgotPasswordPage = React.lazy(() => import('@/modules/user/auth/pages/ForgotPasswordPage'));
const OnboardingPage = React.lazy(() => import('@/modules/user/profile/pages/OnboardingPage'));
const ProfilePage = React.lazy(() => import('@/modules/user/profile/pages/ProfilePage'));
const MyTicketsPage = React.lazy(() => import('@/modules/user/profile/pages/MyTicketsPage'));
const OrderHistoryPage = React.lazy(() => import('@/modules/user/profile/pages/OrderHistoryPage'));
const DeleteAccountPage = React.lazy(() => import('@/modules/user/profile/pages/DeleteAccountPage'));
const SupportHubPage = React.lazy(() => import('@/modules/user/support/pages/SupportHubPage'));
const SupportChatPage = React.lazy(() => import('@/modules/user/support/pages/SupportChatPage'));

const CompetitionsPage = React.lazy(() => import('@/modules/user/competitions/pages/CompetitionsPage'));
const CompetitionDetails = React.lazy(() => import('@/modules/user/competitions/pages/CompetitionDetails'));
const WinnersPage = React.lazy(() => import('@/modules/user/competitions/pages/WinnersPage'));

const TermsConditions = React.lazy(() => import('@/modules/user/legal/pages/TermsConditions'));
const PrivacyPolicy = React.lazy(() => import('@/modules/user/legal/pages/PrivacyPolicy'));
const FreePostalEntry = React.lazy(() => import('@/modules/user/legal/pages/FreePostalEntry'));
const ResponsiblePlay = React.lazy(() => import('@/modules/user/legal/pages/ResponsiblePlay'));
const CompetitionRules = React.lazy(() => import('@/modules/user/legal/pages/CompetitionRules'));

export const UserRoutes = (
  <Route element={<UserLayout />}>
    <Route path="/" element={<Home />} />
    <Route path="/signin" element={<AuthRoute><SignupPage /></AuthRoute>} />
    <Route path="/signup" element={<AuthRoute><SignupPage /></AuthRoute>} />
    <Route path="/forgot-password" element={<AuthRoute><ForgotPasswordPage /></AuthRoute>} />
    <Route path="/onboarding" element={<ProtectedRoute><OnboardingPage /></ProtectedRoute>} />
    <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
    <Route path="/profile/tickets" element={<ProtectedRoute><MyTicketsPage /></ProtectedRoute>} />
    <Route path="/profile/orders" element={<ProtectedRoute><OrderHistoryPage /></ProtectedRoute>} />
    <Route path="/profile/support" element={<ProtectedRoute><SupportHubPage /></ProtectedRoute>} />
    <Route path="/profile/support/:chatId" element={<ProtectedRoute><SupportChatPage /></ProtectedRoute>} />
    <Route path="/profile/delete" element={<ProtectedRoute><DeleteAccountPage /></ProtectedRoute>} />
    <Route path="/competitions" element={<CompetitionsPage />} />
    <Route path="/how-it-works" element={<Home scrollTargetId="how-it-works" />} />
    <Route path="/winner-component" element={<Home scrollTargetId="winners" />} />
    <Route path="/competitions/:id" element={<CompetitionDetails />} />
    <Route path="/winners" element={<WinnersPage />} />
    <Route path="/terms" element={<TermsConditions />} />
    <Route path="/privacy" element={<PrivacyPolicy />} />
    <Route path="/free-postal-entry" element={<FreePostalEntry />} />
    <Route path="/responsible-play" element={<ResponsiblePlay />} />
    <Route path="/rules" element={<CompetitionRules />} />
  </Route>
);
