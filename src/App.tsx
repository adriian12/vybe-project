
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppProvider } from "@/context/app-context";
import { PremiumProvider } from "@/context/premium-context";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import AuthPage from "./pages/AuthPage";
import LocationPage from "./pages/LocationPage";
import HomePage from "./pages/HomePage";
import MatchesPage from "./pages/MatchesPage";
import ProfilePage from "./pages/ProfilePage";
import VenueAuthPage from "./pages/venue/VenueAuthPage";
import VenueDashboardPage from "./pages/venue/VenueDashboardPage";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AppProvider>
        <PremiumProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/auth" element={<AuthPage />} />
              <Route path="/location" element={<LocationPage />} />
              <Route path="/home" element={<HomePage />} />
              <Route path="/matches" element={<MatchesPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/venue/auth" element={<VenueAuthPage />} />
              <Route path="/venue/dashboard" element={<VenueDashboardPage />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </PremiumProvider>
      </AppProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
