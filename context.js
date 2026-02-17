// components/HeaderManagement/ContextApi.jsx  ✅ FULL COPY-PASTE (API + SESSION READY)
// NOTE: This is React Context.
// Fix: user + auth state comes from backend API (/api/auth/me) instead of only localStorage.
// Also includes refreshUser() + refreshFeatures() helpers for Sidebar update.

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

export const ContextApi = createContext(null);

export const AppProvider = ({ children }) => {
  // ✅ API base (optional)
  const API_BASE = import.meta?.env?.VITE_API_BASE_URL || "";

  // ========= Load Previous Login (if any) (fallback only)
  const savedUser = (() => {
    try {
      return JSON.parse(localStorage.getItem("eduportal_user"));
    } catch {
      return null;
    }
  })();

  const [state, setState] = useState({
    user: savedUser || null,
    isAuthenticated: !!savedUser,
    toast: null,
    loadingUser: true
  });

  // =====================================
  // 🚀 TOAST FUNCTION
  // =====================================
  const showToast = (message, type = "info") => {
    const toast = {
      id: Date.now(),
      message,
      type,
      visible: true
    };

    setState((prev) => ({ ...prev, toast }));

    setTimeout(() => {
      setState((prev) => ({ ...prev, toast: null }));
    }, 3000);
  };

  // =====================================
  // ✅ GET CURRENT USER FROM BACKEND (SESSION/COOKIE)
  // Backend should return: { user: {...} } or { user: null }
  // =====================================
  const refreshUser = async () => {
    try {
      setState((prev) => ({ ...prev, loadingUser: true }));

      const res = await fetch(`${API_BASE}/api/auth/me`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        credentials: "include" // ✅ important
      });

      if (!res.ok) {
        // If backend says unauthorized, clear user
        setState((prev) => ({
          ...prev,
          user: null,
          isAuthenticated: false,
          loadingUser: false
        }));
        localStorage.removeItem("eduportal_user");
        return;
      }

      const data = await res.json();
      const user = data?.user || null;

      if (user) {
        // Save fallback
        localStorage.setItem("eduportal_user", JSON.stringify({ ...user, isAuthenticated: true }));

        setState((prev) => ({
          ...prev,
          user: { ...user, isAuthenticated: true },
          isAuthenticated: true,
          loadingUser: false
        }));
      } else {
        localStorage.removeItem("eduportal_user");
        setState((prev) => ({
          ...prev,
          user: null,
          isAuthenticated: false,
          loadingUser: false
        }));
      }
    } catch (error) {
      console.error("refreshUser error:", error);
      // keep fallback localStorage user if exists
      setState((prev) => ({
        ...prev,
        loadingUser: false,
        user: prev.user || savedUser || null,
        isAuthenticated: !!(prev.user || savedUser)
      }));
    }
  };

  // =====================================
  // ✅ Trigger sidebar refresh (helper)
  // =====================================
  const refreshFeatures = () => {
    window.dispatchEvent(new Event("featuresUpdated"));
  };

  // =====================================
  // 🚀 LOGIN FUNCTION (API)
  // expects backend: POST /api/auth/login returns { user: {...} }
  // =====================================
  const login = async (credentials) => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(credentials)
      });

      const data = await res.json();

      if (!res.ok) {
        showToast(data?.message || "Login failed", "error");
        return { ok: false, message: data?.message || "Login failed" };
      }

      const user = data?.user;
      if (!user) {
        showToast("Login failed (no user)", "error");
        return { ok: false, message: "Login failed (no user)" };
      }

      const completeUserData = { ...user, isAuthenticated: true };
      localStorage.setItem("eduportal_user", JSON.stringify(completeUserData));

      setState((prev) => ({
        ...prev,
        user: completeUserData,
        isAuthenticated: true
      }));

      showToast(`Welcome back, ${user.firstName || "User"}!`, "success");

      // refresh sidebar
      refreshFeatures();

      return { ok: true };
    } catch (error) {
      console.error("login error:", error);
      showToast("Login failed (network)", "error");
      return { ok: false, message: "Network error" };
    }
  };

  // =====================================
  // 🚀 LOGOUT (API)
  // expects backend: POST /api/auth/logout
  // =====================================
  const logout = async () => {
    try {
      await fetch(`${API_BASE}/api/auth/logout`, {
        method: "POST",
        credentials: "include"
      });
    } catch (e) {
      console.warn("logout api failed, clearing local state anyway");
    }

    localStorage.removeItem("eduportal_user");

    setState((prev) => ({
      ...prev,
      user: null,
      isAuthenticated: false,
      toast: {
        id: Date.now(),
        message: "Logged out successfully!",
        type: "info",
        visible: true
      }
    }));

    setTimeout(() => {
      setState((prev) => ({ ...prev, toast: null }));
    }, 3000);
  };

  // =====================================
  // 🚀 UPDATE USER PROFILE (API optional)
  // if you have backend endpoint: PATCH /api/users/me
  // =====================================
  const updateUser = async (updatedData) => {
    if (!state.user) return;

    try {
      const res = await fetch(`${API_BASE}/api/users/me`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(updatedData)
      });

      // if endpoint not available, fallback local update
      if (!res.ok) throw new Error("Update API failed");

      const data = await res.json();
      const newUser = data?.user || { ...state.user, ...updatedData };

      localStorage.setItem("eduportal_user", JSON.stringify(newUser));

      setState((prev) => ({
        ...prev,
        user: newUser
      }));

      showToast("Profile updated!", "success");
    } catch (err) {
      console.warn("updateUser fallback:", err);

      const newUserData = { ...state.user, ...updatedData };
      localStorage.setItem("eduportal_user", JSON.stringify(newUserData));

      setState((prev) => ({ ...prev, user: newUserData }));
      showToast("Profile updated!", "success");
    }
  };

  // =====================================
  // ✅ Auto refresh user on app load
  // =====================================
  useEffect(() => {
    refreshUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo(() => ({
    user: state.user,
    isAuthenticated: state.isAuthenticated,
    toast: state.toast,
    loadingUser: state.loadingUser,

    login,
    logout,
    updateUser,
    showToast,

    refreshUser,
    refreshFeatures
  }), [state.user, state.isAuthenticated, state.toast, state.loadingUser]);

  return (
    <ContextApi.Provider value={value}>
      {children}
    </ContextApi.Provider>
  );
};

// =====================================
// CUSTOM HOOK
// =====================================
export const useAppContext = () => {
  const context = useContext(ContextApi);
  if (!context) throw new Error("useAppContext must be used within AppProvider");
  return context;
};

// =====================================
// TOAST COMPONENT (Tailwind classes)
// If Tailwind not installed, replace className with normal CSS.
// =====================================
export const Toast = () => {
  const { toast } = useAppContext();
  if (!toast) return null;

  const bgColor = {
    success: "bg-green-500",
    error: "bg-red-500",
    info: "bg-blue-500",
    warning: "bg-yellow-500"
  }[toast.type] || "bg-gray-500";

  return (
    <div className={`fixed top-4 right-4 ${bgColor} text-white px-6 py-3 rounded-lg shadow-lg z-50`}>
      {toast.message}
    </div>
  );
};

// Backward compatibility
export const MyContext = AppProvider;