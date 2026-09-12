import { Navigate, Route, Routes } from "react-router";

import { Layout } from "@/components/Layout";
import { RequireAuth } from "@/components/RequireAuth";
import { Auth } from "@/pages/Auth";
import { Help } from "@/pages/Help";
import { Hires } from "@/pages/Hires";
import { Landing } from "@/pages/Landing";
import { Missing } from "@/pages/Missing";
import { Pricing } from "@/pages/Pricing";
import { Saved } from "@/pages/Saved";
import { Settings } from "@/pages/Settings";
import { ViewProfile } from "@/pages/ViewProfile";
import { Account } from "@/pages/account/Account";
import { AdminAuditLog } from "@/pages/admin/AdminAuditLog";
import { AdminCategories } from "@/pages/admin/AdminCategories";
import { AdminDashboard } from "@/pages/admin/AdminDashboard";
import { AdminLayout } from "@/pages/admin/AdminLayout";
import { AdminListings } from "@/pages/admin/AdminListings";
import { AdminMemberships } from "@/pages/admin/AdminMemberships";
import { AdminPhotos } from "@/pages/admin/AdminPhotos";
import { AdminSkills } from "@/pages/admin/AdminSkills";
import { AdminUsers } from "@/pages/admin/AdminUsers";
import { AdminVerification } from "@/pages/admin/AdminVerification";
import { Chat } from "@/pages/chat/Chat";

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        {/* Public */}
        <Route index element={<Landing />} />
        {/* The front page absorbed browsing; old links still land somewhere. */}
        <Route path="browse" element={<Navigate to="/" replace />} />
        <Route path="helpers/:id" element={<ViewProfile />} />
        <Route path="pricing" element={<Pricing />} />
        <Route path="help" element={<Help />} />
        {/* Keyed, so moving between the two resets the form rather than
            carrying a half-typed sign-in into a join. */}
        <Route path="signin" element={<Auth key="signin" mode="signin" />} />
        <Route path="join" element={<Auth key="join" mode="join" />} />

        {/* Signed in */}
        <Route element={<RequireAuth />}>
          <Route path="account" element={<Account />} />
          <Route path="settings" element={<Settings />} />
          <Route path="saved" element={<Saved />} />
          <Route path="hires" element={<Hires />} />
          <Route path="messages" element={<Chat />} />
          <Route path="messages/:id" element={<Chat />} />
        </Route>

        {/* Admin */}
        <Route element={<RequireAuth role="admin" />}>
          <Route path="admin" element={<AdminLayout />}>
            <Route index element={<AdminDashboard />} />
            <Route path="verification" element={<AdminVerification />} />
            <Route path="photos" element={<AdminPhotos />} />
            <Route path="users" element={<AdminUsers />} />
            <Route path="listings" element={<AdminListings />} />
            <Route path="memberships" element={<AdminMemberships />} />
            <Route path="categories" element={<AdminCategories />} />
            <Route path="skills" element={<AdminSkills />} />
            <Route path="log" element={<AdminAuditLog />} />
          </Route>
        </Route>

        <Route path="*" element={<Missing />} />
      </Route>
    </Routes>
  );
}
