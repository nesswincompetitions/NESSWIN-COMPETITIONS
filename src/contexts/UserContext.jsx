import { createContext, useContext, useMemo } from 'react';
import { useAuth } from '@/shared/state/AuthContext';

const UserContext = createContext(undefined);

export function UserProvider({ children }) {
  const { userData, loading } = useAuth();

  const value = useMemo(() => ({ userData, loading, error: null }), [userData, loading]);

  return (
    <UserContext.Provider value={value}>
      {children}
    </UserContext.Provider>
  );
}

export function useUserData() {
  const context = useContext(UserContext);

  if (context === undefined) {
    throw new Error('useUserData must be used within a UserProvider');
  }

  return context;
}

export default UserContext;
