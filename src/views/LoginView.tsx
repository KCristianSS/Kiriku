import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { api, apiClient } from '../api/client';
import { ShieldCheck, LogIn, AlertCircle, Info } from 'lucide-react';

interface DemoUser {
  id: string;
  nombre: string;
  email: string;
  rol: string;
}

export const LoginView: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [email, setEmail] = useState('admin@kiriku.org');
  const [password, setPassword] = useState('Admin123!');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [demoUsers, setDemoUsers] = useState<DemoUser[]>([]);

  useEffect(() => {
    async function loadDemoUsers() {
      try {
        const res = await apiClient.get('/auth/demo-users');
        setDemoUsers(res.data);
      } catch (e) {
        console.error('Error loading users from DB:', e);
      }
    }
    loadDemoUsers();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError('Ingresa tu correo y contraseña.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await api.login({
        email: email.trim(),
        password,
      });
      localStorage.setItem('kiriku_admin_token', res.token || 'dev-admin-token');
      localStorage.setItem('kiriku_user_email', res.user?.email || email);
      const redirect = searchParams.get('redirect') || '/admin';
      navigate(redirect, { replace: true });
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Correo o contraseña incorrectos.');
    } finally {
      setBusy(false);
    }
  };

  const fillCredentials = (fillEmail: string, fillPass: string) => {
    setEmail(fillEmail);
    setPassword(fillPass);
    setError('');
  };

  return (
    <div className="max-w-md mx-auto px-4 py-16">
      <div className="bg-white rounded-3xl border border-stone-200 p-8 shadow-sm space-y-6">
        <div className="text-center">
          <div className="w-12 h-12 bg-[#E8F6F8] text-[#1E7B85] rounded-2xl flex items-center justify-center mx-auto mb-3">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <p className="text-xs font-bold uppercase tracking-wider text-[#1E7B85]">Kirikú Voluntariado</p>
          <h1 className="text-2xl font-extrabold text-stone-900 mt-1">Iniciar sesión</h1>
          <p className="text-xs text-stone-500 mt-1">Acceso administrativo para revisión, roles y reportes</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">Correo electrónico</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              autoComplete="username"
              required
              placeholder="admin@kiriku.org"
              className="w-full rounded-xl border border-stone-300 px-3 py-2.5 text-sm focus:border-[#289EAB] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">Contraseña</label>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete="current-password"
              required
              placeholder="••••••••"
              className="w-full rounded-xl border border-stone-300 px-3 py-2.5 text-sm focus:border-[#289EAB] focus:outline-none"
            />
          </div>

          {error && (
            <p
              role="alert"
              className="text-xs font-semibold text-red-700 bg-red-50 p-3 rounded-xl border border-red-200 flex items-center gap-2"
            >
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{error}</span>
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-[#289EAB] hover:bg-[#1E7B85] px-4 py-2.5 text-sm font-bold text-white transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <LogIn className="w-4 h-4" />
            <span>{busy ? 'Validando credenciales…' : 'Ingresar al panel'}</span>
          </button>
        </form>

        {/* Cuentas reales cargadas directamente de la BD */}
        {demoUsers.length > 0 && (
          <div className="pt-4 border-t border-stone-100 space-y-2">
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-stone-500 uppercase tracking-wider">
              <Info className="w-3.5 h-3.5 text-[#289EAB]" />
              <span>Cuentas activas en la BD (Clic para autocompletar):</span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              {demoUsers.map((u) => (
                <button
                  key={u.email}
                  type="button"
                  onClick={() => fillCredentials(u.email, 'Admin123!')}
                  className="p-2.5 rounded-xl bg-stone-50 hover:bg-[#E8F6F8] hover:text-[#1E7B85] border border-stone-200 text-left cursor-pointer transition-all"
                >
                  <span className="font-bold block truncate text-stone-900">{u.email}</span>
                  <span className="text-[10px] text-stone-500 block truncate">
                    {u.nombre} ({u.rol})
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LoginView;
