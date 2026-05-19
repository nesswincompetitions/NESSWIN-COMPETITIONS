import React from 'react';
import { Route, Navigate } from 'react-router-dom';
import AdminLayout from '@/shared/layouts/AdminLayout';
import { ProtectedRoute } from './ProtectedRoute.jsx';

const Dashboard = React.lazy(() => import('@/modules/admin/dashboard/pages/Dashboard'));
const BonusTickets = React.lazy(() => import('@/modules/admin/bonus/pages/BonusTickets'));

const SupportInboxPage = React.lazy(() => import('@/modules/admin/support/pages/SupportInboxPage'));

const CompetitionsList = React.lazy(() => import('@/modules/admin/competitions/pages/CompetitionsList'));
const CreateCompetition = React.lazy(() => import('@/modules/admin/competitions/pages/CreateCompetition'));
const CompetitionDrafts = React.lazy(() => import('@/modules/admin/competitions/pages/CompetitionDrafts'));
const CompetitionDetail = React.lazy(() => import('@/modules/admin/competitions/pages/CompetitionDetail'));

const WinnersList = React.lazy(() => import('@/modules/admin/winners/pages/WinnersList'));
const WinnerDetail = React.lazy(() => import('@/modules/admin/winners/pages/WinnerDetail'));
const OrdersList = React.lazy(() => import('@/modules/admin/orders/pages/OrdersList'));
const OrderDetail = React.lazy(() => import('@/modules/admin/orders/pages/OrderDetail'));
const ReferralsList = React.lazy(() => import('@/modules/admin/referrals/pages/ReferralsList'));
const ReferralDetail = React.lazy(() => import('@/modules/admin/referrals/pages/ReferralDetail'));

const UsersList = React.lazy(() => import('@/modules/admin/users/pages/UsersList'));
const UserDetail = React.lazy(() => import('@/modules/admin/users/pages/UserDetail'));

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
