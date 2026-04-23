import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { UserRoutes } from './routes/userRoutes';
import { AdminRoutes } from './routes/adminRoutes';

const App = () => {
  return (
    <Router>
      <Routes>
        {UserRoutes}
        {AdminRoutes}
        
        {/* If the route does not exist (404), redirect to Home */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
};

export default App;