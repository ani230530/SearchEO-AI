import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import Profile from "./pages/Profile";
import LandingPage from "./pages/LandingPage";
import SidebarDashboard from "./pages/SidebarDashboard";
import KnowledgeBase from "./pages/KnowledgeBase";
import AIVisibilityRedirect from "./pages/AIVisibilityRedirect";
import AICheckerV2 from "./pages/AIChecker.v2";
import AIResultsReportPreview from "./pages/AIResultsReportPreview";
import AIResultsPromptGaps from "./pages/AIResultsPromptGaps";
import AIResultsCompetitors from "./pages/AIResultsCompetitors";
import TrackPromptsPage from "./pages/TrackPromptsPage";
import TrackKeywordsPage from "./pages/TrackKeywordsPage";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            {console.log("App Rendering Routes")}
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
            <Route path="/ai-checker-v2" element={
              <ProtectedRoute>
                <AICheckerV2 />
              </ProtectedRoute>
            } />
            {/* Legacy /ai-checker-page → redirect to the new wizard for any old bookmarks */}
            <Route path="/ai-checker-page" element={<Navigate to="/ai-checker-v2" replace />} />
            <Route path="/ai-results/:domain/track-prompts" element={
              <ProtectedRoute>
                <TrackPromptsPage />
              </ProtectedRoute>
            } />
            <Route path="/ai-results/:domain/track-keywords" element={
              <ProtectedRoute>
                <TrackKeywordsPage />
              </ProtectedRoute>
            } />
            <Route path="/ai-results/:domain" element={
              <ProtectedRoute>
                <AIResultsReportPreview />
              </ProtectedRoute>
            } />
            <Route path="/ai-results-prompt-gaps" element={
              <ProtectedRoute>
                <AIResultsPromptGaps />
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
            <Route path="/ai-results-report-preview" element={<AIVisibilityRedirect />} />
            <Route path="/ai-results-report" element={<AIVisibilityRedirect />} />
            <Route path="/airesults-competitors-preview" element={
               <AIResultsCompetitors />
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
