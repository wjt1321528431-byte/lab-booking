import React, { createContext, useContext, useState, useEffect } from 'react';
import type { User } from '../types';
import { getCurrentUser, setCurrentUser } from '../utils/storage';

interface AuthContextType {
  currentUser: User | null;
  login: (user: User) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUserState] = useState<User | null>(() =>
    getCurrentUser()
  );

  useEffect(() => {
    setCurrentUser(currentUser);
  }, [currentUser]);

  const login = (user: User) => {
    setCurrentUserState(user);
  };

  const logout = () => {
    setCurrentUserState(null);
  };

  return (
    <AuthContext.Provider value={{ currentUser, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
