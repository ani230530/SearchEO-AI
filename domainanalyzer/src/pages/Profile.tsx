import React, { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { User as UserIcon, Mail, Lock, ShieldCheck, Save } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface ProfileProps {
  compact?: boolean;
}

const Profile: React.FC<ProfileProps> = ({ compact = false }) => {
  const { user, updateProfile, changePassword, loading } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [name, setName] = useState<string>(user?.name || "");
  const [currentPassword, setCurrentPassword] = useState<string>("");
  const [newPassword, setNewPassword] = useState<string>("");
  const [confirmPassword, setConfirmPassword] = useState<string>("");
  const [emailDisplay, setEmailDisplay] = useState<string>(user?.email || "");
  const [isSubmittingProfile, setIsSubmittingProfile] = useState<boolean>(false);
  const [isSubmittingPassword, setIsSubmittingPassword] = useState<boolean>(false);

  useEffect(() => {
    setName(user?.name || "");
    setEmailDisplay(user?.email || "");
  }, [user?.name, user?.email]);

  useEffect(() => {
    const token = localStorage.getItem("authToken");
    if (!token) {
      navigate("/auth");
      return;
    }
    void (async () => {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/me`, {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });
        const data = await res.json();
        if (res.ok && data?.user) {
          setName(data.user.name || "");
          setEmailDisplay(data.user.email || "");
        } else {
          toast({
            title: "Unable to load profile",
            description: data?.error || "Please sign in again.",
            variant: "destructive",
          });
          navigate("/auth");
        }
      } catch {
        toast({
          title: "Network error",
          description: "Could not fetch your profile.",
          variant: "destructive",
        });
        navigate("/auth");
      }
    })();
  }, [navigate, toast]);

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
      toast({
        title: "Update failed",
        description: err instanceof Error ? err.message : "Failed to update profile.",
        variant: "destructive",
      });
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
      toast({
        title: "Passwords don't match",
        description: "Please confirm the new password.",
        variant: "destructive",
      });
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
      toast({
        title: "Change failed",
        description: err instanceof Error ? err.message : "Failed to change password.",
        variant: "destructive",
      });
    } finally {
      setIsSubmittingPassword(false);
    }
  };

  return (
    <div className="relative w-full">
      {!compact ? (
        <div className="fixed inset-0 pointer-events-none">
          <div className="absolute top-1/4 left-1/4 h-96 w-96 rounded-full bg-gray-100 opacity-20 blur-3xl" />
          <div className="absolute right-1/4 bottom-1/4 h-96 w-96 rounded-full bg-gray-100 opacity-20 blur-3xl" />
        </div>
      ) : null}

      <div
        className={`relative z-10 mx-auto ${
          compact ? "w-full px-3 py-2" : "min-w-7xl px-4 py-2 sm:px-6 sm:py-2"
        }`}
      >
        <div className={compact ? "space-y-3" : "space-y-6"}>
          <div className={compact ? "px-1 pb-1" : "mb-8"}>
            <h2
              className={`mb-2 ${
                compact ? "text-lg font-medium text-slate-800" : "text-2xl font-light text-gray-900"
              }`}
              style={compact ? undefined : { letterSpacing: "-0.003em" }}
            >
              Profile Information
            </h2>
            <p
              className={compact ? "text-sm text-gray-600" : "text-sm font-light text-gray-500"}
              style={compact ? undefined : { letterSpacing: "0.011em" }}
            >
              Your account identifiers and personal information
            </p>
          </div>

          <div
            className={`border border-gray-200 ${
              compact
                ? "overflow-hidden rounded-md bg-white"
                : "rounded-2xl bg-white/70 p-8 backdrop-blur-md hover:shadow-lg"
            }`}
            style={compact ? undefined : { borderWidth: "0.5px" }}
          >
            {compact ? (
              <div className="border-b border-gray-200 px-4 py-3">
                <h3 className="text-base font-medium text-slate-800">Account Details</h3>
              </div>
            ) : null}

            <form onSubmit={handleProfileSubmit} className={compact ? "space-y-4 px-4 py-5" : "space-y-6"}>
              <div>
                <Label
                  htmlFor="email"
                  className="mb-2 block text-sm font-light text-gray-900"
                  style={{ letterSpacing: "0.011em" }}
                >
                  Email
                </Label>
                <div className="relative">
                  <Mail className="absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <Input
                    id="email"
                    value={emailDisplay}
                    readOnly
                    aria-readonly
                    aria-label="Email"
                    className={`border-gray-200 bg-gray-50 pl-11 text-gray-700 ${
                      compact ? "h-11 rounded-md font-normal" : "h-12 rounded-2xl font-light"
                    } focus-visible:border-gray-900 focus-visible:ring-2 focus-visible:ring-gray-900`}
                    style={{ borderWidth: "0.5px", letterSpacing: "0.011em" }}
                  />
                </div>
              </div>

              <div>
                <Label
                  htmlFor="name"
                  className="mb-2 block text-sm font-light text-gray-900"
                  style={{ letterSpacing: "0.011em" }}
                >
                  Name
                </Label>
                <div className="relative">
                  <UserIcon className="absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                    className={`border-gray-200 bg-gray-50 pl-11 placeholder-gray-400 ${
                      compact ? "h-11 rounded-md font-normal" : "h-12 rounded-2xl font-light"
                    } focus-visible:border-gray-900 focus-visible:ring-2 focus-visible:ring-gray-900`}
                    style={{ borderWidth: "0.5px", letterSpacing: "0.011em" }}
                  />
                </div>
              </div>

              <div className="pt-2">
                <Button
                  type="submit"
                  disabled={isSubmittingProfile || loading}
                  className={`text-white ${
                    compact
                      ? "rounded-md bg-[#2D4059] px-4 py-2 text-sm font-medium hover:bg-[#25364b]"
                      : "rounded-full bg-black px-8 py-3 font-light transition-all hover:bg-gray-800 active:scale-95"
                  } disabled:cursor-not-allowed disabled:opacity-50`}
                  style={{ letterSpacing: "-0.022em" }}
                >
                  <Save className="mr-2 h-4 w-4" />
                  {isSubmittingProfile ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </form>
          </div>

          <div
            className={`border border-gray-200 ${
              compact
                ? "overflow-hidden rounded-md bg-white"
                : "rounded-2xl bg-white/70 p-8 backdrop-blur-md hover:shadow-lg"
            }`}
            style={compact ? undefined : { borderWidth: "0.5px" }}
          >
            <div className={compact ? "border-b border-gray-200 px-4 py-3" : "mb-8"}>
              <div className="mb-2 flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-gray-600" />
                <h2
                  className={compact ? "text-base font-medium text-slate-800" : "text-2xl font-light text-gray-900"}
                  style={compact ? undefined : { letterSpacing: "-0.003em" }}
                >
                  Security
                </h2>
              </div>
              <p
                className={compact ? "text-sm text-gray-600" : "text-sm font-light text-gray-500"}
                style={compact ? undefined : { letterSpacing: "0.011em" }}
              >
                Update your password to keep your account secure
              </p>
            </div>

            <form onSubmit={handlePasswordSubmit} className={compact ? "space-y-4 px-4 py-5" : "space-y-6"}>
              <div>
                <Label
                  htmlFor="currentPassword"
                  className="mb-2 block text-sm font-light text-gray-900"
                  style={{ letterSpacing: "0.011em" }}
                >
                  Current Password
                </Label>
                <div className="relative">
                  <Lock className="absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <Input
                    id="currentPassword"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className={`border-gray-200 bg-gray-50 pl-11 ${
                      compact ? "h-11 rounded-md font-normal" : "h-12 rounded-2xl font-light"
                    } focus-visible:border-gray-900 focus-visible:ring-2 focus-visible:ring-gray-900`}
                    style={{ borderWidth: "0.5px", letterSpacing: "0.011em" }}
                    autoComplete="current-password"
                  />
                </div>
              </div>

              <div>
                <Label
                  htmlFor="newPassword"
                  className="mb-2 block text-sm font-light text-gray-900"
                  style={{ letterSpacing: "0.011em" }}
                >
                  New Password
                </Label>
                <div className="relative">
                  <Lock className="absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <Input
                    id="newPassword"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className={`border-gray-200 bg-gray-50 pl-11 ${
                      compact ? "h-11 rounded-md font-normal" : "h-12 rounded-2xl font-light"
                    } focus-visible:border-gray-900 focus-visible:ring-2 focus-visible:ring-gray-900`}
                    style={{ borderWidth: "0.5px", letterSpacing: "0.011em" }}
                    autoComplete="new-password"
                  />
                </div>
                <p className="mt-2 text-xs font-light text-gray-500" style={{ letterSpacing: "0.011em" }}>
                  Minimum 8 characters; mix letters, numbers, symbols.
                </p>
              </div>

              <div>
                <Label
                  htmlFor="confirmPassword"
                  className="mb-2 block text-sm font-light text-gray-900"
                  style={{ letterSpacing: "0.011em" }}
                >
                  Confirm New Password
                </Label>
                <div className="relative">
                  <Lock className="absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className={`border-gray-200 bg-gray-50 pl-11 ${
                      compact ? "h-11 rounded-md font-normal" : "h-12 rounded-2xl font-light"
                    } focus-visible:border-gray-900 focus-visible:ring-2 focus-visible:ring-gray-900`}
                    style={{ borderWidth: "0.5px", letterSpacing: "0.011em" }}
                    autoComplete="new-password"
                  />
                </div>
              </div>

              <div className="pt-2">
                <Button
                  type="submit"
                  disabled={isSubmittingPassword || loading}
                  className={`text-white ${
                    compact
                      ? "w-full rounded-md bg-[#2D4059] px-4 py-2 text-sm font-medium hover:bg-[#25364b] sm:w-auto"
                      : "w-full rounded-full bg-black px-8 py-3 font-light transition-all hover:bg-gray-800 active:scale-95 sm:w-auto"
                  } disabled:cursor-not-allowed disabled:opacity-50`}
                  style={{ letterSpacing: "-0.022em" }}
                >
                  {isSubmittingPassword ? "Updating..." : "Change Password"}
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
