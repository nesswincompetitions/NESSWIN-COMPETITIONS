import React from 'react';
import { Route } from 'react-router-dom';
import Home from '../modules/user/pages/Home';
import SignupPage from '../modules/user/pages/SignupPage';
import CompetitionsPage from '../modules/user/pages/CompetitionsPage';
import CompetitionDetails from '../modules/user/pages/CompetitionDetails';
import WinnersPage from '../modules/user/pages/WinnersPage';
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
  </Route>
);
