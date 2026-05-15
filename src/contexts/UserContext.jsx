import { createContext, useContext } from 'react';
import { useAuth } from '@/shared/state/AuthContext';
import { useRealtimeUser } from '@/hooks/useRealtimeUser';

const UserContext = createContext(undefined);

export function UserProvider({ children }) {
  const { currentUser } = useAuth();
  const userId = currentUser?.uid ?? null;
  const { userData, loading, error } = useRealtimeUser(userId);

  return (
    <UserContext.Provider value={{ userData, loading, error }}>
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
