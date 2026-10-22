import { Route, Routes } from 'react-router-dom';
import PublicLayout from './layouts/PublicLayout.jsx';
import { ProtectedRoute } from './components/RouteGuards.jsx';
import Landing from './pages/Landing.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import Profile from './pages/Profile.jsx';
import AccessDenied from './pages/AccessDenied.jsx';
import NotFound from './pages/NotFound.jsx';
import MyUploads from './pages/MyUploads.jsx';
import Search from './pages/Search.jsx';
import DocumentDetails from './pages/DocumentDetails.jsx';
import { AdminRoute } from './components/RouteGuards.jsx';
import AdminLayout from './layouts/AdminLayout.jsx';
import AdminDashboard from './pages/admin/AdminDashboard.jsx';
import AdminUsers from './pages/admin/AdminUsers.jsx';
import AdminDocuments from './pages/admin/AdminDocuments.jsx';
import AdminReports from './pages/admin/AdminReports.jsx';
import AdminAuditLogs from './pages/admin/AdminAuditLogs.jsx';
import AdminMetadataOptions from './pages/admin/AdminMetadataOptions.jsx';

export default function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route index element={<Landing />} />
        <Route path="login" element={<Login />} />
        <Route path="register" element={<Register />} />
        <Route path="forgot-password" element={<ForgotPassword />} />
        <Route path="reset-password" element={<ResetPassword />} />
        <Route path="search" element={<ProtectedRoute />}>
          <Route index element={<Search />} />
        </Route>
        <Route element={<ProtectedRoute />}>
          <Route path="profile" element={<Profile />} />
          <Route path="my-uploads" element={<MyUploads />} />
          <Route path="documents/:id" element={<DocumentDetails />} />
        </Route>
        <Route element={<AdminRoute />}>
          <Route path="admin" element={<AdminLayout />}>
            <Route index element={<AdminDashboard />} />
            <Route path="users" element={<AdminUsers />} />
            <Route path="documents" element={<AdminDocuments />} />
            <Route path="reports" element={<AdminReports />} />
            <Route path="audit-logs" element={<AdminAuditLogs />} />
            <Route path="metadata-options" element={<AdminMetadataOptions />} />
          </Route>
        </Route>
        <Route path="access-denied" element={<AccessDenied />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
