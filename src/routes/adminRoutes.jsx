import React from 'react';
import { Route, Navigate } from 'react-router-dom';
import AdminLayout from '../layouts/AdminLayout';
import Dashboard from '../modules/admin/pages/Dashboard';

export const AdminRoutes = (
  <Route path="/admin" element={<AdminLayout />}>
    <Route index element={<Navigate to="dashboard" replace />} />
    <Route path="dashboard" element={<Dashboard />} />
    {/* Catch-all for undefined admin routes */}
    <Route path="*" element={<Dashboard />} /> 
  </Route>
);
