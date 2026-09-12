import {
  BadgeCheck,
  BadgeIndianRupee,
  HandHeart,
  MessageCircle,
  ShieldAlert,
  Star,
  UserRoundSearch,
  type LucideIcon,
} from "lucide-react";

/**
 * One icon per notification kind, shared by the header panel and the pinned
 * Sahaya thread in chat, so the same event never looks like two different
 * things. Kinds come from backend/app/services/notify.py and its callers.
 */
export const NOTIFICATION_ICONS: Record<string, LucideIcon> = {
  message: MessageCircle,
  hire_request: HandHeart,
  review: Star,
  verification: BadgeCheck,
  profile: UserRoundSearch,
  billing: BadgeIndianRupee,
  account: ShieldAlert,
};

export function notificationIcon(kind: string): LucideIcon {
  return NOTIFICATION_ICONS[kind] ?? MessageCircle;
}
