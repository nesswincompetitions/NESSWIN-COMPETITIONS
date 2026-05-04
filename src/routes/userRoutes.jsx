import React from 'react';
import { Route } from 'react-router-dom';
import { ProtectedRoute, AuthRoute } from '@/routes/ProtectedRoute';
import UserLayout from '@/shared/layouts/UserLayout';

import Home from '@/modules/user/home/pages/Home';
import SignupPage from '@/modules/user/auth/pages/SignupPage';
import ForgotPasswordPage from '@/modules/user/auth/pages/ForgotPasswordPage';
import OnboardingPage from '@/modules/user/profile/pages/OnboardingPage';
import ProfilePage from '@/modules/user/profile/pages/ProfilePage';

import CompetitionsPage from '@/modules/user/competitions/pages/CompetitionsPage';
import CompetitionDetails from '@/modules/user/competitions/pages/CompetitionDetails';
import WinnersPage from '@/modules/user/competitions/pages/WinnersPage';

import TermsConditions from '@/modules/user/legal/pages/TermsConditions';
import PrivacyPolicy from '@/modules/user/legal/pages/PrivacyPolicy';
import FreePostalEntry from '@/modules/user/legal/pages/FreePostalEntry';
import ResponsiblePlay from '@/modules/user/legal/pages/ResponsiblePlay';
import CompetitionRules from '@/modules/user/legal/pages/CompetitionRules';

export const UserRoutes = (
  <Route element={<UserLayout />}>
    <Route path="/" element={<Home />} />
    <Route path="/signin" element={<AuthRoute><SignupPage /></AuthRoute>} />
    <Route path="/forgot-password" element={<AuthRoute><ForgotPasswordPage /></AuthRoute>} />
    <Route path="/onboarding" element={<ProtectedRoute><OnboardingPage /></ProtectedRoute>} />
    <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
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
