import React from 'react';
import { Route, Navigate } from 'react-router-dom';
import AdminLayout from '../layouts/AdminLayout';
import { ProtectedRoute } from '../components/common/ProtectedRoute';
import Dashboard from '../modules/admin/pages/Dashboard';
import CompetitionsList from '../modules/admin/pages/CompetitionsList';
import CreateCompetition from '../modules/admin/pages/CreateCompetition';
import CompetitionDetail from '../modules/admin/pages/CompetitionDetail';
import WinnersList from '../modules/admin/pages/WinnersList';
import WinnerDetail from '../modules/admin/pages/WinnerDetail';
import UsersList from '../modules/admin/pages/UsersList';
import UserDetail from '../modules/admin/pages/UserDetail';
import OrdersList from '../modules/admin/pages/OrdersList';
import OrderDetail from '../modules/admin/pages/OrderDetail';
import ReferralsList from '../modules/admin/pages/ReferralsList';
import ReferralDetail from '../modules/admin/pages/ReferralDetail';
import BonusTickets from '../modules/admin/pages/BonusTickets';
import Settings from '../modules/admin/pages/Settings';

export const AdminRoutes = (
  <Route path="/admin" element={<ProtectedRoute requireAdmin={true}><AdminLayout /></ProtectedRoute>}>
    <Route index element={<Navigate to="dashboard" replace />} />
    <Route path="dashboard" element={<Dashboard />} />
    <Route path="competitions" element={<CompetitionsList />} />
    <Route path="competitions/create" element={<CreateCompetition />} />
    <Route path="competitions/:id" element={<CompetitionDetail />} />
    <Route path="winners" element={<WinnersList />} />
    <Route path="winners/:id" element={<WinnerDetail />} />
    <Route path="users" element={<UsersList />} />
    <Route path="users/:id" element={<UserDetail />} />
    <Route path="orders" element={<OrdersList />} />
    <Route path="orders/:id" element={<OrderDetail />} />
    <Route path="referrals" element={<ReferralsList />} />
    <Route path="referrals/:id" element={<ReferralDetail />} />
    <Route path="bonus-tickets" element={<BonusTickets />} />
    <Route path="settings" element={<Settings />} />
    {/* Catch-all for undefined admin routes */}
    <Route path="*" element={<Dashboard />} /> 
  </Route>
);
