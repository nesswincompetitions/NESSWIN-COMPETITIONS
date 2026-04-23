import React, { useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigationType } from 'react-router-dom';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import Home from './pages/Home';
import CompetitionDetails from './pages/CompetitionDetails';
import CompetitionsPage from './pages/CompetitionsPage';
import WinnersPage from './pages/WinnersPage';
import SignupPage from './pages/SignupPage';

const ScrollManager = () => {
  const location = useLocation();
  const navType = useNavigationType();
  const scrollPositionsRef = useRef(new Map());

  // Skip top-scroll for section-target routes.
  const isSectionTargetRoute = [
    '/how-it-works',
    '/winner-component',
  ].includes(location.pathname);

  useEffect(() => {
    const savedPositions = scrollPositionsRef.current;

    return () => {
      savedPositions.set(location.key, window.scrollY);
    };
  }, [location.key]);

  useEffect(() => {
    if (navType === 'POP') {
      const restoreY = scrollPositionsRef.current.get(location.key) ?? 0;
      window.scrollTo({ top: restoreY, left: 0, behavior: 'auto' });
      return;
    }

    if (!location.hash && !isSectionTargetRoute) {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    }
  }, [location.key, location.hash, navType, isSectionTargetRoute]);

  return null;
};

const AppLayout = () => {
  const location = useLocation();

  return (
    <div className="bg-[#050505] min-h-screen flex flex-col">
      <ScrollManager />
      <Navbar />

      <main className="grow">
        <div className="route-page" key={location.pathname}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/signin" element={<SignupPage />} />
            <Route path="/competitions" element={<CompetitionsPage />} />
            <Route path="/how-it-works" element={<Home scrollTargetId="how-it-works" />} />
            <Route path="/winner-component" element={<Home scrollTargetId="winners" />} />
            <Route path="/competitions/:id" element={<CompetitionDetails />} />
            <Route path="/winners" element={<WinnersPage />} />

            {/* If the route does not exist (404), redirect to Home */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </main>

      <Footer />
    </div>
  );
};

const App = () => {
  return (
    <Router>
      <AppLayout />
    </Router>
  );
};

export default App;