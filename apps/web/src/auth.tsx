import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

const apiUrl = import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? "http://localhost:4000" : "");

export type AuthUser = { id: string; name: string; email: string };

type Credentials = { email: string; password: string };
type Registration = Credentials & { name: string };
type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  login: (credentials: Credentials) => Promise<void>;
  register: (details: Registration) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export async function apiRequest(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${apiUrl}${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init.headers }
  });
}

async function readUserResponse(response: Response): Promise<AuthUser> {
  const result = await response.json().catch(() => ({})) as { user?: AuthUser; error?: string };
  if (!response.ok || !result.user) throw new Error(result.error || "The request could not be completed.");
  return result.user;
}

function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    apiRequest("/api/auth/me")
      .then(async (response) => response.ok ? await readUserResponse(response) : null)
      .then((currentUser) => { if (active) setUser(currentUser); })
      .catch(() => { if (active) setUser(null); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    loading,
    async login(credentials) {
      const response = await apiRequest("/api/auth/login", { method: "POST", body: JSON.stringify(credentials) });
      setUser(await readUserResponse(response));
    },
    async register(details) {
      const response = await apiRequest("/api/auth/register", { method: "POST", body: JSON.stringify(details) });
      setUser(await readUserResponse(response));
    },
    async logout() {
      await apiRequest("/api/auth/logout", { method: "POST" });
      setUser(null);
    }
  }), [user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function AuthProviderRoot({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProviderRoot.");
  return context;
}
