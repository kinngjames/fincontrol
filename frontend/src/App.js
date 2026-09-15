import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { Layout } from "@/components/Layout";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Bots from "@/pages/Bots";
import BotDetail from "@/pages/BotDetail";
import Funds from "@/pages/Funds";
import Savings from "@/pages/Savings";
import CashFlow from "@/pages/CashFlow";
import Settings from "@/pages/Settings";
import { Loader2 } from "lucide-react";

function Protected({ children }) {
  const { user } = useAuth();
  if (user === null)
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
      </div>
    );
  if (!user) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

function AppRoutes() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <Login />} />
      <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
      <Route path="/bots" element={<Protected><Bots /></Protected>} />
      <Route path="/bots/:id" element={<Protected><BotDetail /></Protected>} />
      <Route path="/funds" element={<Protected><Funds /></Protected>} />
      <Route path="/savings" element={<Protected><Savings /></Protected>} />
      <Route path="/cashflow" element={<Protected><CashFlow /></Protected>} />
      <Route path="/settings" element={<Protected><Settings /></Protected>} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <div className="App">
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
        <Toaster position="top-right" richColors />
      </AuthProvider>
    </div>
  );
}

export default App;
