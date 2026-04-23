import React from 'react';
import { Route, Navigate } from 'react-router-dom';
import AdminLayout from '../layouts/AdminLayout';
import Dashboard from '../modules/admin/pages/Dashboard';
import CompetitionsList from '../modules/admin/pages/CompetitionsList';
import CreateCompetition from '../modules/admin/pages/CreateCompetition';
import CompetitionDetail from '../modules/admin/pages/CompetitionDetail';

export const AdminRoutes = (
  <Route path="/admin" element={<AdminLayout />}>
    <Route index element={<Navigate to="dashboard" replace />} />
    <Route path="dashboard" element={<Dashboard />} />
    <Route path="competitions" element={<CompetitionsList />} />
    <Route path="competitions/create" element={<CreateCompetition />} />
    <Route path="competitions/:id" element={<CompetitionDetail />} />
    {/* Catch-all for undefined admin routes */}
    <Route path="*" element={<Dashboard />} /> 
  </Route>
);
