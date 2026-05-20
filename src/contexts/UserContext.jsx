import { createContext, useContext } from 'react';
import { useAuth } from '@/shared/state/AuthContext';

const UserContext = createContext(undefined);

export function UserProvider({ children }) {
  const { userData, loading } = useAuth();

  return (
    <UserContext.Provider value={{ userData, loading, error: null }}>
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
