import React from 'react';
import { Route } from 'react-router-dom';
import Home from '../modules/user/pages/Home';
import SignupPage from '../modules/user/pages/SignupPage';
import CompetitionsPage from '../modules/user/pages/CompetitionsPage';
import CompetitionDetails from '../modules/user/pages/CompetitionDetails';
import WinnersPage from '../modules/user/pages/WinnersPage';
import TermsConditions from '../modules/user/pages/legal/TermsConditions';
import PrivacyPolicy from '../modules/user/pages/legal/PrivacyPolicy';
import FreePostalEntry from '../modules/user/pages/legal/FreePostalEntry';
import ResponsiblePlay from '../modules/user/pages/legal/ResponsiblePlay';
import CompetitionRules from '../modules/user/pages/legal/CompetitionRules';
import UserLayout from '../layouts/UserLayout';

export const UserRoutes = (
  <Route element={<UserLayout />}>
    <Route path="/" element={<Home />} />
    <Route path="/signin" element={<SignupPage />} />
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
