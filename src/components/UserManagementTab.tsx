import * as React from 'react';
import { useState, useMemo } from 'react';
import { Plus, X, Trash2, Edit3, Shield, Users, UserCheck, Check, Search } from 'lucide-react';
import { UserProfile } from '../types';

interface UserManagementTabProps {
  isRegistering: boolean;
  setIsRegistering: (v: boolean) => void;
  authName: string;
  setAuthName: (v: string) => void;
  authEmail: string;
  setAuthEmail: (v: string) => void;
  authRole: 'ADMIN' | 'LÍDER' | 'SETOR';
  setAuthRole: (v: 'ADMIN' | 'LÍDER' | 'SETOR') => void;
  authSectors: string[];
  setAuthSectors: (v: string[]) => void;
  handleRegister: (e: React.FormEvent) => void;
  loginLoading: boolean;
  usersList: UserProfile[];
  setShowUserDeleteConfirm: (v: { show: boolean; user: UserProfile | null }) => void;
  sectors: string[];
  editingUser: UserProfile | null;
  setEditingUser: (u: UserProfile | null) => void;
}

export const UserManagementTab: React.FC<UserManagementTabProps> = ({
  isRegistering,
  setIsRegistering,
  authName,
  setAuthName,
  authEmail,
  setAuthEmail,
  authRole,
  setAuthRole,
  authSectors,
  setAuthSectors,
  handleRegister,
  loginLoading,
  usersList,
  setShowUserDeleteConfirm,
  sectors,
  editingUser,
  setEditingUser
}) => {
  const [roleFilter, setRoleFilter] = useState<'ALL' | 'LÍDER' | 'SETOR' | 'ADMIN'>('ALL');
  const [searchUser, setSearchUser] = useState<string>('');

  const filteredUsers = useMemo(() => {
    return usersList.filter(u => {
      if (roleFilter !== 'ALL' && u.role !== roleFilter) return false;
      if (searchUser.trim()) {
        const term = searchUser.toLowerCase();
        const matchesName = (u.name || '').toLowerCase().includes(term);
        const matchesEmail = (u.email || '').toLowerCase().includes(term);
        const matchesSectors = (u.allowedSectors || [u.sector]).some(s => (s || '').toLowerCase().includes(term));
        if (!matchesName && !matchesEmail && !matchesSectors) return false;
      }
      return true;
    });
  }, [usersList, roleFilter, searchUser]);

  const handleStartEdit = (user: UserProfile) => {
    setEditingUser(user);
    setAuthName(user.name || '');
    setAuthEmail(user.email || '');
    setAuthRole(user.role || 'LÍDER');
    setAuthSectors(user.allowedSectors && user.allowedSectors.length > 0 ? user.allowedSectors : [user.sector || sectors[0]]);
    setIsRegistering(true);
  };

  const handleCancelForm = () => {
    setIsRegistering(false);
    setEditingUser(null);
    setAuthName('');
    setAuthEmail('');
    setAuthRole('LÍDER');
    setAuthSectors([]);
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h3 className="text-2xl font-black text-slate-900">Gerenciamento de Usuários & Perfis</h3>
          <p className="text-xs text-slate-500 mt-1">
            Controle de acesso por papel: o almoxarifado tem visão total do patrimônio, enquanto os líderes acessam estritamente o que for cadastrado em seu usuário.
          </p>
        </div>
        {!isRegistering && (
          <button 
            onClick={() => {
              setEditingUser(null);
              setAuthName('');
              setAuthEmail('');
              setAuthRole('LÍDER');
              setAuthSectors([sectors[0]]);
              setIsRegistering(true);
            }}
            className="bg-slate-900 text-white px-5 py-3 rounded-2xl text-xs font-black uppercase tracking-wider flex items-center gap-2 hover:bg-slate-800 transition-all shadow-md shrink-0"
          >
            <Plus size={16} /> Cadastrar Usuário / Líder
          </button>
        )}
      </div>

      {/* Registration / Edit Modal Box */}
      {isRegistering && (
        <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-lg space-y-6 max-w-3xl animate-in fade-in">
          <div className="flex justify-between items-center pb-4 border-b border-slate-100">
            <div>
              <h4 className="text-base font-black text-slate-900">
                {editingUser ? `Editar Usuário: ${editingUser.name || editingUser.email}` : 'Cadastrar Novo Usuário ou Líder'}
              </h4>
              <p className="text-xs text-slate-400 mt-0.5">
                Defina o papel do colaborador e os setores hospitalares autorizados.
              </p>
            </div>
            <button 
              onClick={handleCancelForm} 
              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all"
            >
              <X size={18} />
            </button>
          </div>

          <form onSubmit={handleRegister} className="space-y-5">
            {/* Role Selection */}
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">
                Papel / Nível de Acesso no Sistema *
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => setAuthRole('LÍDER')}
                  className={`p-3.5 rounded-2xl border text-left transition-all ${
                    authRole === 'LÍDER'
                      ? 'border-blue-600 bg-blue-50/60 ring-2 ring-blue-500/20'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-blue-900">LÍDER DE SETOR</span>
                    {authRole === 'LÍDER' && <Check size={14} className="text-blue-600" />}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                    Acesso exclusivo ao que for cadastrado em seu usuário e setores vinculados.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setAuthRole('SETOR')}
                  className={`p-3.5 rounded-2xl border text-left transition-all ${
                    authRole === 'SETOR'
                      ? 'border-emerald-600 bg-emerald-50/60 ring-2 ring-emerald-500/20'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-emerald-900">COLABORADOR DO SETOR</span>
                    {authRole === 'SETOR' && <Check size={14} className="text-emerald-600" />}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                    Acesso básico de solicitação aos setores vinculados.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setAuthRole('ADMIN')}
                  className={`p-3.5 rounded-2xl border text-left transition-all ${
                    authRole === 'ADMIN'
                      ? 'border-amber-600 bg-amber-50/60 ring-2 ring-amber-500/20'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-amber-900">ALMOXARIFADO / PATRIMÔNIO</span>
                    {authRole === 'ADMIN' && <Check size={14} className="text-amber-600" />}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                    Acesso total: gerencia estoque, vê o sistema de cada líder e todo o patrimônio.
                  </p>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">
                  Nome Completo *
                </label>
                <input 
                  type="text" 
                  required
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:border-blue-500"
                  placeholder="Nome do líder ou colaborador"
                  value={authName}
                  onChange={e => setAuthName(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">
                  E-mail de Login Google *
                </label>
                <input 
                  type="email" 
                  required
                  disabled={Boolean(editingUser)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 disabled:opacity-60 focus:outline-none focus:border-blue-500"
                  placeholder="email@gmail.com"
                  value={authEmail}
                  onChange={e => setAuthEmail(e.target.value)}
                />
                {editingUser && (
                  <p className="text-[10px] text-slate-400 mt-1">O e-mail é o identificador único e não pode ser alterado.</p>
                )}
              </div>
            </div>

            {/* Sectors Assignment */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider">
                  Setor(es) sob Responsabilidade deste Usuário ({authSectors.length} selecionados) *
                </label>
                <div className="flex gap-2 text-[10px]">
                  <button
                    type="button"
                    onClick={() => setAuthSectors([...sectors])}
                    className="text-blue-600 font-bold hover:underline"
                  >
                    Marcar Todos
                  </button>
                  <span>•</span>
                  <button
                    type="button"
                    onClick={() => setAuthSectors([sectors[0]])}
                    className="text-slate-500 font-bold hover:underline"
                  >
                    Apenas Primeiro
                  </button>
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 max-h-48 overflow-y-auto flex flex-wrap gap-1.5">
                {sectors.map(sector => {
                  const isSelected = authSectors.includes(sector);
                  return (
                    <button
                      key={sector}
                      type="button"
                      onClick={() => {
                        if (isSelected) {
                          if (authSectors.length > 1) {
                            setAuthSectors(authSectors.filter(s => s !== sector));
                          }
                        } else {
                          setAuthSectors([...authSectors, sector]);
                        }
                      }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                        isSelected 
                          ? 'bg-blue-600 text-white shadow-sm' 
                          : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {sector}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={handleCancelForm}
                className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all"
              >
                Cancelar
              </button>
              <button 
                type="submit"
                disabled={loginLoading || authSectors.length === 0}
                className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-black uppercase tracking-wider rounded-xl shadow-md transition-all flex items-center gap-2"
              >
                {loginLoading ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  editingUser ? 'Salvar Alterações' : 'Salvar Novo Usuário'
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por nome, e-mail ou setor..."
            value={searchUser}
            onChange={(e) => setSearchUser(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto">
          <span className="text-[10px] font-black uppercase text-slate-400 mr-1">Filtrar Papel:</span>
          {(['ALL', 'LÍDER', 'SETOR', 'ADMIN'] as const).map(role => (
            <button
              key={role}
              onClick={() => setRoleFilter(role)}
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all ${
                roleFilter === role
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              {role === 'ALL' ? 'Todos' : role === 'LÍDER' ? 'Líderes' : role === 'SETOR' ? 'Colaboradores' : 'Almoxarifado'}
            </button>
          ))}
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="p-5 border-b border-slate-100 flex justify-between items-center">
          <h4 className="font-black text-sm text-slate-900">
            Usuários Cadastrados ({filteredUsers.length})
          </h4>
          <span className="text-xs text-slate-400">
            Os líderes só têm acesso ao que está listado em seus setores vinculados.
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-wider">
              <tr>
                <th className="p-4 pl-6">Nome</th>
                <th className="p-4">E-mail</th>
                <th className="p-4">Papel no Sistema</th>
                <th className="p-4">Setor(es) sob Responsabilidade</th>
                <th className="p-4 pr-6 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-400">
                    Nenhum usuário encontrado com os filtros selecionados.
                  </td>
                </tr>
              ) : (
                filteredUsers.map(u => {
                  const userSectors = (u.allowedSectors && u.allowedSectors.length > 0)
                    ? u.allowedSectors
                    : [u.sector].filter(Boolean);

                  return (
                    <tr key={u.id || u.email} className="hover:bg-slate-50/70 transition-colors">
                      <td className="p-4 pl-6 font-bold text-slate-900">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-slate-100 font-black text-[10px] flex items-center justify-center text-slate-700">
                            {u.name ? u.name.slice(0, 2).toUpperCase() : 'US'}
                          </div>
                          <span>{u.name || 'Sem nome'}</span>
                        </div>
                      </td>
                      <td className="p-4 text-slate-600 font-medium">{u.email}</td>
                      <td className="p-4">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${
                          u.role === 'ADMIN'
                            ? 'bg-amber-100 text-amber-900 border border-amber-200'
                            : u.role === 'LÍDER'
                            ? 'bg-blue-100 text-blue-900 border border-blue-200'
                            : 'bg-emerald-100 text-emerald-900 border border-emerald-200'
                        }`}>
                          {u.role === 'ADMIN' ? 'Almoxarifado (Total)' : u.role === 'LÍDER' ? 'Líder de Setor' : 'Colaborador de Setor'}
                        </span>
                      </td>
                      <td className="p-4 text-slate-600">
                        <div className="flex flex-wrap gap-1 max-w-md">
                          {userSectors.map(sec => (
                            <span key={sec} className="bg-slate-100 text-slate-800 px-2 py-0.5 rounded text-[11px] font-semibold border border-slate-200">
                              {sec}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="p-4 pr-6 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleStartEdit(u)}
                            className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-all"
                            title="Editar Usuário e Setores"
                          >
                            <Edit3 size={15} />
                          </button>
                          {u.email !== 'gerlianemagalhaes79@gmail.com' && (
                            <button
                              onClick={() => setShowUserDeleteConfirm({ show: true, user: u })}
                              className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-all"
                              title="Excluir Usuário"
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
