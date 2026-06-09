import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { ChatWidget } from "@/features/chat/ChatWidget";

// Eager — needed for first paint or are tiny / part of the auth funnel.
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import LandingPage from "./pages/LandingPage";
import AIVisibilityRedirect from "./pages/AIVisibilityRedirect";
import { AIResultsShell } from "./features/ai-results/AIResultsShell";

// Lazy — gated behind auth or under the AI Checker shell. Each becomes its
// own chunk, downloaded only when the user navigates to it.
const SidebarDashboard = lazy(() => import("./pages/SidebarDashboard"));
const KnowledgeBase = lazy(() => import("./pages/KnowledgeBase"));
const AICheckerV2 = lazy(() => import("./pages/AIChecker.v2"));
const AIResultsReportPreview = lazy(() => import("./pages/AIResultsReportPreview"));
const AIResultsCompetitors = lazy(() => import("./pages/AIResultsCompetitors"));
const PromptsPage = lazy(() => import("./pages/PromptsPage"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const VerifyEmailPending = lazy(() => import("./pages/VerifyEmailPending"));

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

/** Minimal route-level fallback. Renders while a lazy chunk is downloading. */
const RouteFallback = () => (
  <div className="flex h-screen w-full items-center justify-center bg-white">
    <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-[#2D4059]" aria-label="Loading…" />
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
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
              <Route path="/auth/reset-password" element={<ResetPassword />} />
              <Route path="/auth/verify-email-pending" element={
                <ProtectedRoute requireVerified={false}>
                  <VerifyEmailPending />
                </ProtectedRoute>
              } />

              {/* Protected routes */}
              <Route path="/dashboard" element={
                <ProtectedRoute>
                  <SidebarDashboard />
                </ProtectedRoute>
              } />
              <Route path="/ai-visibility" element={
                <Navigate to="/dashboard?tab=ai-visibility" replace />
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
              <Route element={<ProtectedRoute><AIResultsShell activeItem="prompts" title="Top Prompts" /></ProtectedRoute>}>
                <Route path="/ai-results/:domain/prompts" element={<PromptsPage />} />
              </Route>
              <Route element={<ProtectedRoute><AIResultsShell activeItem="ai-results" title="AI Results" /></ProtectedRoute>}>
                <Route path="/ai-results/:domain" element={<AIResultsReportPreview />} />
              </Route>
              <Route path="/profile" element={
                <ProtectedRoute>
                  <Navigate to="/dashboard?tab=settings&subtab=profile" replace />
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
              <Route element={<AIResultsShell activeItem="competitors" title="Competitors Intelligence" />}>
                <Route path="/airesults-competitors-preview" element={<AIResultsCompetitors />} />
              </Route>

              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
          {/* Global conversational agent — renders only for signed-in users. */}
          <ChatWidget />
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
