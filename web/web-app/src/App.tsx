import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";

// Layouts / wrappers
import Navbar from "./components/Navbar";

// Pages
import AccountDetails from "./pages/AccountDetails";
import AddDuo from "./pages/AddDuo";
import AddGig from "./pages/AddGig";
import AddGroup from "./pages/AddGroup";
import AddStudio from "./pages/AddStudio";
import AdminDashboard from "./pages/AdminDashboard";
import AISuggestions from "./pages/AISuggestions";
import Bookings from "./pages/Bookings";
import ChangeEmail from "./pages/ChangeEmail";
import ChangePassword from "./pages/ChangePassword";
import Chat from "./pages/Chat";
import Discover from "./pages/Discover";
import EditGig from "./pages/EditGig";
import EditGroup from "./pages/EditGroup";
import EditProfile from "./pages/EditProfile";
import EditStudio from "./pages/EditStudio";
import ForgotPassword from "./pages/ForgotPassword";
import GroupDetails from "./pages/GroupDetails";
import HelpSupport from "./pages/HelpSupport";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Manage from "./pages/Manage";
import ManageGig from "./pages/ManageGig";
import ManageGroup from "./pages/ManageGroup";
import ManageStudio from "./pages/ManageStudio";
import MyGroup from "./pages/MyGroup";
import MyStudio from "./pages/MyStudio";
import MyVenue from "./pages/MyVenue";
import Notifications from "./pages/Notifications";
import NotificationSettings from "./pages/NotificationSettings";
import PaymentResult from "./pages/PaymentResult";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import Profile from "./pages/Profile";
import Settings from "./pages/Settings";
import Signup from "./pages/Signup";
import SubmitReview from "./pages/SubmitReview";
import SubscriptionRequired from "./pages/SubscriptionRequired";
import TermsAndConditions from "./pages/TermsAndConditions";
import ToReview from "./pages/ToReview";
import Wallet from "./pages/Wallet";

function AdminRoute() {
  const { isAdmin, roleResolved } = useAuth();

  if (!roleResolved) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white dark:bg-gray-900">
        <span className="spinner" />
      </div>
    );
  }

  if (!isAdmin) {
    return <Navigate to="/home" replace />;
  }

  return <AdminDashboard />;
}

function AuthenticatedLayout() {
  return (
    <>
      <Navbar />
      <div className="lg:pl-20 pb-28 lg:pb-0 min-h-screen">
        <Routes>
          <Route path="/home" element={<Home />} />
          <Route path="/discover" element={<Discover />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/bookings" element={<Bookings />} />
          <Route path="/manage" element={<Manage />} />
          <Route path="/admin" element={<AdminRoute />} />
          <Route path="/ai-suggestions" element={<AISuggestions />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/change-password" element={<ChangePassword />} />
          <Route path="/change-email" element={<ChangeEmail />} />
          <Route path="/wallet" element={<Wallet />} />
          <Route
            path="/subscription-required"
            element={<SubscriptionRequired />}
          />
          <Route path="/help-support" element={<HelpSupport />} />
          <Route
            path="/terms-and-conditions"
            element={<TermsAndConditions />}
          />
          <Route path="/privacy-policy" element={<PrivacyPolicy />} />
          <Route path="/account-details" element={<AccountDetails />} />
          <Route path="/edit-profile" element={<EditProfile />} />
          <Route path="/submit-review" element={<SubmitReview />} />
          <Route path="/to-review" element={<ToReview />} />
          <Route
            path="/notification-settings"
            element={<NotificationSettings />}
          />
          <Route path="/add-gig" element={<AddGig />} />
          <Route path="/add-group" element={<AddGroup />} />
          <Route path="/add-studio" element={<AddStudio />} />
          <Route path="/add-duo" element={<AddDuo />} />
          <Route path="/edit-gig" element={<EditGig />} />
          <Route path="/edit-group" element={<EditGroup />} />
          <Route path="/edit-studio" element={<EditStudio />} />
          <Route path="/manage-gig" element={<ManageGig />} />
          <Route path="/manage-group" element={<ManageGroup />} />
          <Route path="/manage-studio" element={<ManageStudio />} />
          <Route path="/my-studio" element={<MyStudio />} />
          <Route path="/my-group" element={<MyGroup />} />
          <Route path="/my-venue" element={<MyVenue />} />
          <Route path="/group-details" element={<GroupDetails />} />
          <Route path="*" element={<Navigate to="/home" replace />} />
        </Routes>
      </div>
    </>
  );
}

function AppRoutes() {
  const { session, isGuest, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white dark:bg-gray-900">
        <span className="spinner" />
      </div>
    );
  }

  // If not logged in and not a guest, show auth screens
  if (!session && !isGuest) {
    return (
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/payment-result" element={<PaymentResult />} />
        <Route path="/change-password" element={<ChangePassword />} />
        <Route path="/terms-and-conditions" element={<TermsAndConditions />} />
        <Route path="/privacy-policy" element={<PrivacyPolicy />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  return <AuthenticatedLayout />;
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
