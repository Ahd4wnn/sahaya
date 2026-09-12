import { Navigate } from "react-router";

import { useAuth } from "@/features/auth/AuthContext";
import { HelperAccount } from "./HelperAccount";
import { HirerAccount } from "./HirerAccount";

/** One route, two bodies: a helper edits their card, a family their household. */
export function Account() {
  const { user } = useAuth();
  if (!user) return null;
  if (user.role === "admin") return <Navigate to="/admin" replace />;
  return user.role === "helper" ? <HelperAccount /> : <HirerAccount />;
}
