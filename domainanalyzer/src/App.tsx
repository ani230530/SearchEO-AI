import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import DomainDashboard from "./pages/DomainDashboard";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import Profile from "./pages/Profile";
import LandingPage from "./pages/LandingPage";
import SidebarDashboard from "./pages/SidebarDashboard";
import KnowledgeBase from "./pages/KnowledgeBase";
import AIVisibilityRedirect from "./pages/AIVisibilityRedirect";
import AIResultsReportPreview from "./pages/AIResultsReportPreview";

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
            <Route path="/ai-visibility" element={
              <ProtectedRoute>
                <AIVisibilityRedirect />
              </ProtectedRoute>
            } />
            <Route path="/ai-results/:domain" element={
              <ProtectedRoute>
                <AIResultsReportPreview />
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
            <Route path="/knowledge-base" element={
              <ProtectedRoute>
                <KnowledgeBase />
              </ProtectedRoute>
            } />
            <Route path="/wordpress-connection" element={
              <ProtectedRoute>
                <Navigate to="/dashboard?tab=integration&subtab=integration&wordpress=1" replace />
              </ProtectedRoute>
            } />
            <Route path="/ai-results-report-preview" element={
               <AIResultsReportPreview />
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
