import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import api from "@/lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // null = loading, false = unauth, object = auth

  const loadMe = useCallback(async () => {
    const token = localStorage.getItem("fc_token");
    if (!token) {
      setUser(false);
      return;
    }
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
    } catch {
      localStorage.removeItem("fc_token");
      setUser(false);
    }
  }, []);

  useEffect(() => {
    loadMe();
  }, [loadMe]);

  const selectProfile = async (userId) => {
    const { data } = await api.post("/auth/select", { user_id: userId });
    localStorage.setItem("fc_token", data.token);
    setUser(data.user);
    return data.user;
  };

  const logout = () => {
    localStorage.removeItem("fc_token");
    setUser(false);
  };

  const updateUser = (patch) => setUser((u) => ({ ...u, ...patch }));

  return (
    <AuthContext.Provider value={{ user, selectProfile, logout, updateUser, reload: loadMe }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
