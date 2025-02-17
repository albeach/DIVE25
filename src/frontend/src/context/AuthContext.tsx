import { createContext, useEffect, useState } from 'react';
import Keycloak from 'keycloak-js';
import { useNavigate } from '@tanstack/react-router';

interface User {
  id: string;
  name: string;
  email: string;
  roles: string[];
  clearanceLevel: string;
  countryOfAffiliation: string;
  coiAccess: string[];
  token: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  error: Error | null;
  login: () => void;
  logout: () => void;
  refreshToken: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType>({} as AuthContextType);

const keycloak = new Keycloak({
  url: import.meta.env.VITE_KEYCLOAK_URL,
  realm: import.meta.env.VITE_KEYCLOAK_REALM,
  clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    initializeKeycloak();
  }, []);

  const initializeKeycloak = async () => {
    try {
      const authenticated = await keycloak.init({
        onLoad: 'check-sso',
        silentCheckSsoRedirectUri: window.location.origin + '/silent-check-sso.html',
        pkceMethod: 'S256'
      });

      if (authenticated) {
        updateUserInfo();
      }
    } catch (err) {
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  };

  const updateUserInfo = async () => {
    if (keycloak.tokenParsed) {
      setUser({
        id: keycloak.subject!,
        name: keycloak.tokenParsed.name,
        email: keycloak.tokenParsed.email,
        roles: keycloak.realmAccess?.roles || [],
        clearanceLevel: keycloak.tokenParsed.clearance_level,
        countryOfAffiliation: keycloak.tokenParsed.countryOfAffiliation,
        coiAccess: keycloak.tokenParsed.coi_access || [],
        token: keycloak.token!
      });
    }
  };

  const login = () => {
    keycloak.login();
  };

  const logout = () => {
    keycloak.logout();
    setUser(null);
    navigate({ to: '/' });
  };

  const refreshToken = async () => {
    try {
      await keycloak.updateToken(70);
      updateUserInfo();
    } catch (err) {
      console.error('Failed to refresh token', err);
      logout();
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        error,
        login,
        logout,
        refreshToken
      }}
    >
      {children}
    </AuthContext.Provider>
  );
} 