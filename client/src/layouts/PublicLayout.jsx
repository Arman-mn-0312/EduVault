import { Link, Outlet, useNavigate } from 'react-router-dom';
import { BookOpenCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import SearchBar from '../components/SearchBar.jsx';

export default function PublicLayout() {
  const { session, profile, loading, signOut } = useAuth();
  const navigate = useNavigate();

  async function onLogout() {
    await signOut();
    navigate('/', { replace: true });
  }

  const link = 'rounded-lg px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100';

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2 font-semibold text-indigo-700">
            <BookOpenCheck className="h-6 w-6" aria-hidden="true" />
            <span>EduVault</span>
          </Link>
          <nav aria-label="Account" className="flex items-center gap-1">
            {!loading && session && profile ? (
              <>
                <SearchBar />
                <Link to="/profile" className={link}>{profile.fullName}</Link>
                <Link to="/my-uploads" className={link}>My uploads</Link>
                {profile.role === 'admin' && <Link to="/admin" className={link}>Admin</Link>}
                <button type="button" onClick={onLogout} className={link}>Log out</button>
              </>
            ) : !loading ? (
              <>
                <Link to="/login" className={link}>Log in</Link>
                <Link to="/register" className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700">Register</Link>
              </>
            ) : null}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6">
        <Outlet />
      </main>
      <footer className="border-t border-slate-200 bg-white py-6 text-center text-sm text-slate-500">
        EduVault
      </footer>
    </div>
  );
}
