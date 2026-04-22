export type SettingsSubTab =
  | "profile"
  | "knowledge-base"
  | "privacy-security"
  | "notifications"
  | "subscription"
  | "integrations";

export interface SettingsItem {
  id: SettingsSubTab;
  title: string;
  subtitle: string;
}

export const SETTINGS_ITEMS: SettingsItem[] = [
  { id: "profile", title: "Profile", subtitle: "Info about you and your preferences." },
  {
    id: "privacy-security",
    title: "Privacy & Security",
    subtitle: "Upgrade to get more out of our subscription",
  },
  {
    id: "notifications",
    title: "Notification Settings",
    subtitle: "Upgrade to get more out of our subscription",
  },
  {
    id: "subscription",
    title: "Subscription & Billing",
    subtitle: "Upgrade to get more out of our subscription",
  },
  {
    id: "integrations",
    title: "Integrations",
    subtitle: "Upgrade to get more out of our subscription",
  },
];
