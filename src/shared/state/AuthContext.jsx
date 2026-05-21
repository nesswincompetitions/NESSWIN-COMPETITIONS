import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '@/config/firebase';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [initialLoading, setInitialLoading] = useState(true);

  useEffect(() => {
    let unsubscribeDoc = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (unsubscribeDoc) {
        unsubscribeDoc();
        unsubscribeDoc = null;
      }

      setLoading(true);
      setCurrentUser(user);
      
      if (user) {
        const userRef = doc(db, 'user', user.uid);
        unsubscribeDoc = onSnapshot(
          userRef,
          (docSnap) => {
            if (docSnap.exists()) {
              const data = docSnap.data();
              if (data.is_active === false) {
                signOut(auth);
                setUserData(null);
                localStorage.removeItem('nesswin_user_role');
                setLoading(false);
                setInitialLoading(false);
                return;
              }
              setUserData(data);
              localStorage.setItem('nesswin_user_role', data.role || 'user');
            } else {
              setUserData(null);
              localStorage.removeItem('nesswin_user_role');
            }
            setLoading(false);
            setInitialLoading(false);
          },
          (error) => {
            // Gracefully handle permission errors — don't freeze the app
            console.warn('Firestore snapshot error:', error.code, error.message);
            setUserData(null);
            localStorage.removeItem('nesswin_user_role');
            setLoading(false);
            setInitialLoading(false);
          }
        );
      } else {
        setUserData(null);
        localStorage.removeItem('nesswin_user_role');
        setLoading(false);
        setInitialLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeDoc) unsubscribeDoc();
    };
  }, []);

  const value = useMemo(() => ({
    currentUser,
    userData,
    loading,
    initialLoading
  }), [currentUser, userData, loading, initialLoading]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
