import React from 'react';
import { Route, Navigate } from 'react-router-dom';
import AdminLayout from '@/shared/layouts/AdminLayout';
import { ProtectedRoute } from './ProtectedRoute.jsx';

import Dashboard from '@/modules/admin/dashboard/pages/Dashboard';
import BonusTickets from '@/modules/admin/bonus/pages/BonusTickets';

import SupportInboxPage from '@/modules/admin/support/pages/SupportInboxPage';

import CompetitionsList from '@/modules/admin/competitions/pages/CompetitionsList';
import CreateCompetition from '@/modules/admin/competitions/pages/CreateCompetition';
import CompetitionDrafts from '@/modules/admin/competitions/pages/CompetitionDrafts';
import CompetitionDetail from '@/modules/admin/competitions/pages/CompetitionDetail';

import WinnersList from '@/modules/admin/winners/pages/WinnersList';
import WinnerDetail from '@/modules/admin/winners/pages/WinnerDetail';
import OrdersList from '@/modules/admin/orders/pages/OrdersList';
import OrderDetail from '@/modules/admin/orders/pages/OrderDetail';
import ReferralsList from '@/modules/admin/referrals/pages/ReferralsList';
import ReferralDetail from '@/modules/admin/referrals/pages/ReferralDetail';

import UsersList from '@/modules/admin/users/pages/UsersList';
import UserDetail from '@/modules/admin/users/pages/UserDetail';

export const AdminRoutes = (
  <Route path="/admin" element={<ProtectedRoute requireAdmin={true}><AdminLayout /></ProtectedRoute>}>
    <Route index element={<Navigate to="dashboard" replace />} />
    <Route path="dashboard" element={<Dashboard />} />
    <Route path="competitions" element={<CompetitionsList />} />
    <Route path="competitions/create" element={<CreateCompetition />} />
    <Route path="competitions/drafts" element={<CompetitionDrafts />} />
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
    <Route path="support-inbox" element={<SupportInboxPage />} />

    {/* Catch-all for undefined admin routes */}
    <Route path="*" element={<Dashboard />} /> 
  </Route>
);
