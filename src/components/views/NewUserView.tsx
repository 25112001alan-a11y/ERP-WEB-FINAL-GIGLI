import React, { useState } from 'react';
import { ViewPath, User } from '../../types';

interface NewUserViewProps {
  onAddUser: (user: User) => void;
  onNavigate: (view: ViewPath) => void;
}

export const NewUserView: React.FC<NewUserViewProps> = ({ onAddUser, onNavigate }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<User['role']>('Gerente Ventas');
  const [password, setPassword] = useState('');
  const [saved, setSaved] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email) return;

    const newUser: User = {
      id: `U-${Math.floor(100 + Math.random() * 900)}`,
      name,
      email,
      username: username || email.split('@')[0],
      role,
      lastAccess: 'Nunca',
      status: 'Activo',
    };

    onAddUser(newUser);
    setSaved(true);
    setTimeout(() => {
      onNavigate('configuracion');
    }, 1500);
  };

  return (
    <div className="flex flex-col w-full h-full p-lg gap-lg font-body-md text-on-surface">
      <header className="flex items-center justify-between pb-sm border-b border-outline-variant/30">
        <div>
          <nav className="flex items-center gap-2 text-label-md text-on-surface-variant mb-xs">
            <button onClick={() => onNavigate('configuracion')} className="hover:text-primary transition-colors cursor-pointer">
              Configuración
            </button>
            <span className="material-symbols-outlined text-[16px]">chevron_right</span>
            <span className="text-on-surface font-semibold">Nuevo Usuario</span>
          </nav>
          <h1 className="font-display-lg text-display-lg text-on-surface tracking-tight">Alta de Usuario en Nexus ERP</h1>
        </div>
      </header>

      {saved ? (
        <div className="p-xl text-center py-20 bg-surface-container-lowest rounded-xl shadow-md border border-outline-variant/30 flex flex-col items-center gap-md max-w-xl mx-auto">
          <div className="w-16 h-16 rounded-full bg-tertiary-container text-on-tertiary-container flex items-center justify-center">
            <span className="material-symbols-outlined text-[36px]">person_add</span>
          </div>
          <h2 className="font-headline-lg text-headline-lg text-on-surface">Usuario Creado Exitosamente</h2>
          <p className="font-body-lg text-body-lg text-on-surface-variant">Se han enviado las credenciales iniciales al correo configurado.</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="bg-surface-container-lowest p-xl rounded-xl shadow-sm border border-outline-variant/20 max-w-2xl mx-auto w-full space-y-md">
          <h2 className="font-headline-md text-headline-md text-primary flex items-center gap-xs">
            <span className="material-symbols-outlined">badge</span> Credenciales del Usuario
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
            <div className="flex flex-col gap-xs">
              <label className="font-label-md text-label-md uppercase text-on-surface-variant">Nombre Completo *</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej. Gabriel Torres"
                className="bg-surface border border-outline-variant/50 rounded-lg p-sm outline-none focus:border-primary font-body-md"
              />
            </div>

            <div className="flex flex-col gap-xs">
              <label className="font-label-md text-label-md uppercase text-on-surface-variant">Correo Electrónico *</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="gabriel@empresa.com"
                className="bg-surface border border-outline-variant/50 rounded-lg p-sm outline-none focus:border-primary font-body-md"
              />
            </div>

            <div className="flex flex-col gap-xs">
              <label className="font-label-md text-label-md uppercase text-on-surface-variant">Nombre de Usuario</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="gtorres"
                className="bg-surface border border-outline-variant/50 rounded-lg p-sm outline-none focus:border-primary font-mono-sm"
              />
            </div>

            <div className="flex flex-col gap-xs">
              <label className="font-label-md text-label-md uppercase text-on-surface-variant">Rol y Perfil *</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as User['role'])}
                className="bg-surface border border-outline-variant/50 rounded-lg p-sm outline-none cursor-pointer"
              >
                <option value="Super Admin">Super Admin</option>
                <option value="Gerente Ventas">Gerente Ventas</option>
                <option value="Analista Inventario">Analista Inventario</option>
                <option value="Cajero POS">Cajero POS</option>
                <option value="Gerente Sucursal">Gerente Sucursal</option>
              </select>
            </div>

            <div className="flex flex-col gap-xs md:col-span-2">
              <label className="font-label-md text-label-md uppercase text-on-surface-variant">Contraseña Temporal *</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="bg-surface border border-outline-variant/50 rounded-lg p-sm outline-none focus:border-primary font-mono-sm"
              />
            </div>
          </div>

          <div className="flex justify-end gap-md pt-md border-t border-outline-variant/20">
            <button
              type="button"
              onClick={() => onNavigate('configuracion')}
              className="px-md py-sm rounded-lg border border-outline-variant text-on-surface cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-lg py-sm rounded-lg bg-primary text-on-primary font-label-md text-label-md shadow-sm hover:shadow-md cursor-pointer"
            >
              Guardar Usuario
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
