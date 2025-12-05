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
    <div className="min-h-screen bg-white">
      <div className="mx-auto w-full max-w-3xl px-6 py-10">
        <div className="mb-6 rounded-3xl border border-gray-100 bg-gradient-to-br from-white to-gray-50 p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="h-14 w-14 rounded-2xl bg-gray-900 text-white flex items-center justify-center shadow-lg transition-transform duration-200 will-change-transform hover:-translate-y-0.5">
                  <UserIcon className="h-7 w-7" />
                </div>
                <span className="absolute -inset-0.5 -z-10 rounded-3xl bg-gradient-to-tr from-gray-200 to-transparent" aria-hidden />
              </div>
              <div>
                <h1 className="text-xl font-medium text-black tracking-tight">{user?.name || "Your Account"}</h1>
                <p className="text-sm text-gray-600">Manage your profile and security</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* <Button type="button" onClick={() => navigate("/dashboard", { state: { tab: "overview" } })} variant="secondary" className="bg-white border border-gray-200 hover:bg-gray-100 text-gray-800">
                ← Back to Dashboard
              </Button> */}
              <Button type="button" onClick={() => {
    logout();
    navigate("/");
  }} variant="ghost" className="text-gray-700 hover:bg-gray-100 transition-colors">
                <LogOut className="h-4 w-4 mr-2" /> Sign out
              </Button>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-3xl shadow-xl border border-gray-100 p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="pb-1">
                <h2 className="text-sm font-medium text-gray-900">Profile</h2>
                <p className="text-xs text-gray-500">Your account identifiers</p>
              </div>
              <div>
                <Label className="text-gray-800">Email</Label>
                <div className="relative mt-2">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input value={emailDisplay} readOnly aria-readonly aria-label="Email" className="pl-9 bg-gray-50 border-gray-300 text-gray-700 focus-visible:ring-2 focus-visible:ring-gray-900" />
                </div>
              </div>
              {/* User ID intentionally hidden per requirements */}
              <form onSubmit={handleProfileSubmit} className="space-y-3">
                <div>
                  <Label htmlFor="name" className="text-gray-800">Name</Label>
                  <div className="relative mt-2">
                    <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      id="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Your name"
                      className="pl-9 bg-gray-50 border-gray-300 placeholder-gray-400 focus-visible:ring-2 focus-visible:ring-gray-900"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Button type="submit" disabled={isSubmittingProfile || loading} className="bg-gray-900 text-white hover:bg-gray-800 transition-transform duration-150 will-change-transform active:scale-[0.98]">
                    <Save className="h-4 w-4 mr-2" /> {isSubmittingProfile ? "Saving…" : "Save"}
                  </Button>
                </div>
              </form>
            </div>

            <form onSubmit={handlePasswordSubmit} className="space-y-3">
              <div className="pb-1">
                <h2 className="text-sm font-medium text-gray-900">Security</h2>
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-gray-600" />
                  <p className="text-xs text-gray-500">Use a strong, unique password</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <p className="sr-only">Update your password</p>
              </div>
              <div>
                <Label htmlFor="currentPassword" className="text-gray-800">Current password</Label>
                <div className="relative mt-2">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="currentPassword"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="pl-9 bg-gray-50 border-gray-300 focus-visible:ring-2 focus-visible:ring-gray-900"
                    autoComplete="current-password"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="newPassword" className="text-gray-800">New password</Label>
                <div className="relative mt-2">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="newPassword"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="pl-9 bg-gray-50 border-gray-300 focus-visible:ring-2 focus-visible:ring-gray-900"
                    autoComplete="new-password"
                  />
                </div>
                <p className="mt-1 text-xs text-gray-500">Minimum 8 characters; mix letters, numbers, symbols.</p>
              </div>
              <div>
                <Label htmlFor="confirmPassword" className="text-gray-800">Confirm new password</Label>
                <div className="relative mt-2">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="pl-9 bg-gray-50 border-gray-300 focus-visible:ring-2 focus-visible:ring-gray-900"
                    autoComplete="new-password"
                  />
                </div>
              </div>
              <div className="pt-1">
                <Button type="submit" disabled={isSubmittingPassword || loading} className="bg-gray-900 text-white hover:bg-gray-800 w-full md:w-auto transition-transform duration-150 will-change-transform active:scale-[0.98]">
                  {isSubmittingPassword ? "Updating…" : "Change password"}
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


