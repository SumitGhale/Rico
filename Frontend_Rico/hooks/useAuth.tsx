import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  AuthUser,
  fetchCurrentUser,
  login as loginApi,
  logout as logoutApi,
  register as registerApi,
  setUnauthorizedHandler,
} from "@/services/authService";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuthContextValue {
  /** The authenticated user, or null if not logged in. */
  user: AuthUser | null;
  /** True while the initial token check is in progress. */
  isLoading: boolean;
  /** Convenience flag: true when user is authenticated. */
  isAuthenticated: boolean;
  /** Register a new account and log in. */
  register: (email: string, password: string, name?: string) => Promise<void>;
  /** Log in with email and password. */
  login: (email: string, password: string) => Promise<void>;
  /** Log out and clear stored credentials. */
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // On mount, check for an existing token and validate it
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const currentUser = await fetchCurrentUser();
        if (!cancelled) setUser(currentUser);
      } catch {
        // Token invalid or network error — stay logged out
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Let plain service modules trigger a logout: when any authenticated request
  // gets a 401, `handleUnauthorizedToken` clears the token and calls this handler,
  // which resets `user` → `isAuthenticated` false → the guard redirects to sign-in.
  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    return () => setUnauthorizedHandler(null);
  }, []);

  const register = useCallback(
    async (email: string, password: string, name?: string) => {
      const { user: newUser } = await registerApi(email, password, name);
      setUser(newUser);
    },
    []
  );

  const login = useCallback(async (email: string, password: string) => {
    const { user: loggedInUser } = await loginApi(email, password);
    setUser(loggedInUser);
  }, []);

  const logout = useCallback(async () => {
    await logoutApi();
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      isAuthenticated: !!user,
      register,
      login,
      logout,
    }),
    [user, isLoading, register, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an <AuthProvider>");
  }
  return ctx;
}
