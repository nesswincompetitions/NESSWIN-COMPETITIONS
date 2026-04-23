import { useEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

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

export default ScrollManager;
