import React, { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { User as UserIcon, Mail, Lock, ShieldCheck, LogOut, Save } from "lucide-react";
import { useNavigate } from "react-router-dom";

const Profile: React.FC = () => {
  const { user, updateProfile, changePassword, logout, loading } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [name, setName] = useState<string>(user?.name || "");
  const [currentPassword, setCurrentPassword] = useState<string>("");
  const [newPassword, setNewPassword] = useState<string>("");
  const [confirmPassword, setConfirmPassword] = useState<string>("");
  const [emailDisplay, setEmailDisplay] = useState<string>(user?.email || "");
  const [isSubmittingProfile, setIsSubmittingProfile] = useState<boolean>(false);
  const [isSubmittingPassword, setIsSubmittingPassword] = useState<boolean>(false);

  // Keep form state in sync with backend user data
  useEffect(() => {
    setName(user?.name || "");
    setEmailDisplay(user?.email || "");
  }, [user?.name, user?.email]);

  // Load freshest profile data from backend to ensure accurate display
  useEffect(() => {
    const token = localStorage.getItem('authToken');
    if (!token) {
      navigate('/auth');
      return;
    }
    (async () => {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/me`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        const data = await res.json();
        if (res.ok && data?.user) {
          setName(data.user.name || "");
          setEmailDisplay(data.user.email || "");
        } else {
          toast({ title: 'Unable to load profile', description: data?.error || 'Please sign in again.', variant: 'destructive' });
          navigate('/auth');
        }
      } catch (e) {
        toast({ title: 'Network error', description: 'Could not fetch your profile.', variant: 'destructive' });
        navigate('/auth');
      }
    })();
  }, []);

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || name.trim().length === 0) {
      toast({ title: "Name required", description: "Please enter a valid name.", variant: "destructive" });
      return;
    }
    try {
      setIsSubmittingProfile(true);
      await updateProfile(name.trim());
      toast({ title: "Profile updated", description: "Your name was saved successfully." });
    } catch (err) {
      toast({ title: "Update failed", description: err instanceof Error ? err.message : "Failed to update profile.", variant: "destructive" });
    } finally {
      setIsSubmittingProfile(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword || !newPassword) {
      toast({ title: "Missing fields", description: "Fill in all password fields.", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "Passwords don't match", description: "Please confirm the new password.", variant: "destructive" });
      return;
    }
    try {
      setIsSubmittingPassword(true);
      await changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast({ title: "Password changed", description: "Your password was updated successfully." });
    } catch (err) {
      toast({ title: "Change failed", description: err instanceof Error ? err.message : "Failed to change password.", variant: "destructive" });
    } finally {
      setIsSubmittingPassword(false);
    }
  };

  return (
    <div className="relative min-h-screen w-full">
      {/* Background Layer */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-gray-100 rounded-full blur-3xl opacity-20" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-gray-100 rounded-full blur-3xl opacity-20" />
      </div>

      {/* Content Layer */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
        {/* Hero Section */}
        <div className="text-center mb-20 relative">
          <button
            type="button"
            onClick={() => {
              logout();
              navigate("/");
            }}
            className="absolute top-0 right-0 inline-flex items-center gap-2 px-4 py-2 text-sm font-light text-gray-700 hover:bg-gray-100 rounded-full transition-colors"
            style={{ letterSpacing: '0.011em' }}
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>

          <div className="text-xs font-light uppercase tracking-wider text-gray-500 mb-4" style={{ letterSpacing: '0.083em' }}>
            Account Settings
          </div>
          <h1
            className="text-5xl sm:text-6xl md:text-7xl font-extralight mb-6 text-gray-900"
            style={{ letterSpacing: '-0.003em', lineHeight: 1.05 }}
          >
            Your Profile
          </h1>
          <p
            className="text-lg sm:text-xl md:text-2xl font-light text-gray-500 max-w-2xl mx-auto"
            style={{ letterSpacing: '0.011em', lineHeight: 1.4 }}
          >
            Manage your account information and security settings.
          </p>
        </div>

        {/* Profile and Security Cards */}
        <div className="space-y-16">
          {/* Profile Information Card */}
          <div
            className="bg-white/70 backdrop-blur-md rounded-2xl border border-gray-200 p-8 shadow-sm"
            style={{ borderWidth: '0.5px' }}
          >
            <div className="mb-8">
              <h2
                className="text-2xl font-light text-gray-900 mb-2"
                style={{ letterSpacing: '-0.003em' }}
              >
                Profile Information
              </h2>
              <p
                className="text-sm font-light text-gray-500"
                style={{ letterSpacing: '0.011em' }}
              >
                Your account identifiers and personal information
              </p>
            </div>

            <form onSubmit={handleProfileSubmit} className="space-y-6">
              {/* Email Field (Read-only) */}
              <div>
                <Label htmlFor="email" className="text-sm font-light text-gray-900 mb-2 block" style={{ letterSpacing: '0.011em' }}>
                  Email
                </Label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="email"
                    value={emailDisplay}
                    readOnly
                    aria-readonly
                    aria-label="Email"
                    className="pl-11 bg-gray-50 border-gray-200 text-gray-700 font-light rounded-2xl h-12 focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:border-gray-900"
                    style={{ borderWidth: '0.5px', letterSpacing: '0.011em' }}
                  />
                </div>
              </div>

              {/* Name Field */}
              <div>
                <Label htmlFor="name" className="text-sm font-light text-gray-900 mb-2 block" style={{ letterSpacing: '0.011em' }}>
                  Name
                </Label>
                <div className="relative">
                  <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                    className="pl-11 bg-gray-50 border-gray-200 placeholder-gray-400 font-light rounded-2xl h-12 focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:border-gray-900"
                    style={{ borderWidth: '0.5px', letterSpacing: '0.011em' }}
                  />
                </div>
              </div>

              {/* Save Button */}
              <div className="pt-2">
                <Button
                  type="submit"
                  disabled={isSubmittingProfile || loading}
                  className="bg-black text-white rounded-full font-light px-8 py-3 hover:bg-gray-800 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ letterSpacing: '-0.022em' }}
                >
                  <Save className="h-4 w-4 mr-2" />
                  {isSubmittingProfile ? "Saving…" : "Save Changes"}
                </Button>
              </div>
            </form>
          </div>

          {/* Security Card */}
          <div
            className="bg-white/70 backdrop-blur-md rounded-2xl border border-gray-200 p-8 shadow-sm"
            style={{ borderWidth: '0.5px' }}
          >
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-2">
                <ShieldCheck className="h-5 w-5 text-gray-600" />
                <h2
                  className="text-2xl font-light text-gray-900"
                  style={{ letterSpacing: '-0.003em' }}
                >
                  Security
                </h2>
              </div>
              <p
                className="text-sm font-light text-gray-500"
                style={{ letterSpacing: '0.011em' }}
              >
                Update your password to keep your account secure
              </p>
            </div>

            <form onSubmit={handlePasswordSubmit} className="space-y-6">
              {/* Current Password */}
              <div>
                <Label htmlFor="currentPassword" className="text-sm font-light text-gray-900 mb-2 block" style={{ letterSpacing: '0.011em' }}>
                  Current Password
                </Label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="currentPassword"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="pl-11 bg-gray-50 border-gray-200 font-light rounded-2xl h-12 focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:border-gray-900"
                    style={{ borderWidth: '0.5px', letterSpacing: '0.011em' }}
                    autoComplete="current-password"
                  />
                </div>
              </div>

              {/* New Password */}
              <div>
                <Label htmlFor="newPassword" className="text-sm font-light text-gray-900 mb-2 block" style={{ letterSpacing: '0.011em' }}>
                  New Password
                </Label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="newPassword"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="pl-11 bg-gray-50 border-gray-200 font-light rounded-2xl h-12 focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:border-gray-900"
                    style={{ borderWidth: '0.5px', letterSpacing: '0.011em' }}
                    autoComplete="new-password"
                  />
                </div>
                <p className="mt-2 text-xs font-light text-gray-500" style={{ letterSpacing: '0.011em' }}>
                  Minimum 8 characters; mix letters, numbers, symbols.
                </p>
              </div>

              {/* Confirm Password */}
              <div>
                <Label htmlFor="confirmPassword" className="text-sm font-light text-gray-900 mb-2 block" style={{ letterSpacing: '0.011em' }}>
                  Confirm New Password
                </Label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="pl-11 bg-gray-50 border-gray-200 font-light rounded-2xl h-12 focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:border-gray-900"
                    style={{ borderWidth: '0.5px', letterSpacing: '0.011em' }}
                    autoComplete="new-password"
                  />
                </div>
              </div>

              {/* Change Password Button */}
              <div className="pt-2">
                <Button
                  type="submit"
                  disabled={isSubmittingPassword || loading}
                  className="bg-black text-white rounded-full font-light px-8 py-3 hover:bg-gray-800 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto"
                  style={{ letterSpacing: '-0.022em' }}
                >
                  {isSubmittingPassword ? "Updating…" : "Change Password"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;
