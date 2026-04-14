import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import MainDashboard from "./pages/MainDashboard";
import DomainDashboard from "./pages/DomainDashboard";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import Profile from "./pages/Profile";
import LandingPage from "./pages/LandingPage";
import SidebarDashboard from "./pages/SidebarDashboard";
import WordPressConnection from "./pages/WordPressConnection";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            {/* Public routes */}
            <Route path="/" element={<LandingPage />} />
            <Route path="/auth" element={<Auth />} />
            
            {/* Protected routes */}
            <Route path="/dashboard" element={
              <ProtectedRoute>
                <SidebarDashboard />
              </ProtectedRoute>
            } />
            <Route path="/ai-checker" element={
              <ProtectedRoute>
                <MainDashboard />
              </ProtectedRoute>
            } />
            <Route path="/analyze" element={
              <ProtectedRoute>
                <Index />
              </ProtectedRoute>
            } />
            <Route path="/dashboard/:domain" element={
              <ProtectedRoute>
                <DomainDashboard />
              </ProtectedRoute>
            } />
            <Route path="/profile" element={
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            } />
            <Route path="/newdashboard" element={
              <ProtectedRoute>
                <SidebarDashboard />
              </ProtectedRoute>
            } />
            <Route path="/wordpress-connection" element={
              <ProtectedRoute>
                <WordPressConnection />
              </ProtectedRoute>
            } />
            
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
