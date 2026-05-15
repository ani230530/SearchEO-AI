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
import { AIResultsShell } from "./features/ai-results/AIResultsShell";

// Tab-switching inside the AI Checker reuses cached query data for ~5 min
// instead of refetching on every mount. gcTime=30min keeps results around
// for back-navigation; refetchOnWindowFocus is disabled so the user doesn't
// see surprise spinners when alt-tabbing back to the page.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: 'always',
      retry: 1,
    },
  },
});

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
            {/* Anonymous AI Visibility audit. Same component as the
                authenticated dashboard wizard — runs against the wizard
                cookie identity when no JWT is present. Steps 1-4 work
                anonymously; Step 5 (/run) returns 402 SIGNUP_REQUIRED
                which AIChecker.v2 surfaces as a signup wall modal. */}
            <Route path="/audit" element={<AICheckerV2 />} />
            {/* /signup is a permanent shortcut to the audit funnel — old
                marketing links and "Sign Up" buttons across the app
                point here. */}
            <Route path="/signup" element={<Navigate to="/audit" replace />} />
            <Route path="/auth" element={<Auth />} />
            {/* /login is a shortcut for existing users; /auth handles the form. */}
            <Route path="/login" element={<Navigate to="/auth" replace />} />
            
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
            {/* AI Checker tabs share AIResultsShell as a parent route so the
                sidebar + header don't remount on tab switches. Children read
                domain context via useShellContext(). */}
            <Route element={<ProtectedRoute><AIResultsShell activeItem="track-prompts" title="Track Prompts" /></ProtectedRoute>}>
              <Route path="/ai-results/:domain/track-prompts" element={<TrackPromptsPage />} />
            </Route>
            <Route element={<ProtectedRoute><AIResultsShell activeItem="top-keywords" title="Track Keywords" /></ProtectedRoute>}>
              <Route path="/ai-results/:domain/track-keywords" element={<TrackKeywordsPage />} />
            </Route>
            <Route element={<ProtectedRoute><AIResultsShell activeItem="ai-results" title="AI Results" /></ProtectedRoute>}>
              <Route path="/ai-results/:domain" element={<AIResultsReportPreview />} />
            </Route>
            <Route element={<ProtectedRoute><AIResultsShell activeItem="analytics" title="Prompt Gaps" /></ProtectedRoute>}>
              <Route path="/ai-results-prompt-gaps" element={<AIResultsPromptGaps />} />
            </Route>
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
            <Route element={<AIResultsShell activeItem="competitors" title="Competitors" />}>
              <Route path="/airesults-competitors-preview" element={<AIResultsCompetitors />} />
            </Route>
            
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
