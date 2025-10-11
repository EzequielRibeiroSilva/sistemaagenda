import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface User {
  role: 'MASTER' | 'ADMIN' | 'AGENTE' | 'salon' | 'agent' | 'none';
  agentId: string | null;
  email?: string;
  avatarUrl?: string | null;
  permissions?: any;
  userData?: any;
  // Campos críticos para regras de negócio
  id?: number;
  unidade_id?: number | null;
  plano?: 'Single' | 'Multi';
}

interface AuthContextType {
  user: User;
  token: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (loginData: {
    email: string;
    role: string;
    redirectTo: string;
    permissions: any;
    token: string;
    refreshToken?: string;
    user: any;
  }) => void;
  logout: () => void;
  updateUser: (userData: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User>({ role: 'none', agentId: null });
  const [token, setToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Computed property
  const isAuthenticated = token !== null && user.role !== 'none';

  // Inicialização - Ler token persistido do localStorage
  useEffect(() => {
    const initializeAuth = async () => {
      try {

        
        // Ler tokens do localStorage
        const storedToken = localStorage.getItem('authToken');
        const storedRefreshToken = localStorage.getItem('refreshToken');
        const storedUserEmail = localStorage.getItem('userEmail');
        
        if (storedToken && storedUserEmail) {

          
          // Validar token fazendo uma requisição de teste
          try {
            const response = await fetch('http://localhost:3001/api/auth/validate', {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${storedToken}`,
                'Content-Type': 'application/json'
              }
            });

            if (response.ok) {
              const validationData = await response.json();

              
              // Restaurar estado do usuário baseado no token válido
              let frontendRole: User['role'] = 'none';
              
              switch (validationData.data.role) {
                case 'MASTER':
                  frontendRole = 'MASTER';
                  break;
                case 'ADMIN':
                  frontendRole = 'ADMIN';
                  break;
                case 'AGENTE':
                  frontendRole = 'AGENTE';
                  break;
                default:
                  frontendRole = 'salon';
              }

              setToken(storedToken);
              setRefreshToken(storedRefreshToken);
              setUser({
                role: frontendRole,
                agentId: validationData.data.id?.toString() || null,
                email: storedUserEmail,
                avatarUrl: validationData.data.avatar_url || null,
                permissions: validationData.data.permissions,
                userData: validationData.data,
                // Campos críticos para regras de negócio
                id: validationData.data.id,
                unidade_id: validationData.data.unidade_id,
                plano: validationData.data.plano
              });
            } else {
              // Token inválido, limpar storage
              localStorage.removeItem('authToken');
              localStorage.removeItem('refreshToken');
              localStorage.removeItem('userEmail');
            }
          } catch (error) {
            // Erro na validação, limpar storage
            localStorage.removeItem('authToken');
            localStorage.removeItem('refreshToken');
            localStorage.removeItem('userEmail');
          }
        }
      } catch (error) {
        console.error('Erro na inicialização da autenticação:', error);
      } finally {
        setIsLoading(false);
      }
    };

    initializeAuth();
  }, []);

  const login = (loginData: {
    email: string;
    role: string;
    redirectTo: string;
    permissions: any;
    token: string;
    refreshToken?: string;
    user: any;
  }) => {
    
    // Salvar tokens no localStorage
    localStorage.setItem('authToken', loginData.token);
    if (loginData.refreshToken) {
      localStorage.setItem('refreshToken', loginData.refreshToken);
    }
    localStorage.setItem('userEmail', loginData.email);

    // Mapear role do backend para frontend
    let frontendRole: User['role'] = 'none';
    
    switch (loginData.role) {
      case 'MASTER':
        frontendRole = 'MASTER';
        break;
      case 'ADMIN':
        frontendRole = 'ADMIN';
        break;
      case 'AGENTE':
        frontendRole = 'AGENTE';
        break;
      default:
        frontendRole = 'salon';
    }

    // Atualizar estado
    setToken(loginData.token);
    setRefreshToken(loginData.refreshToken || null);
    setUser({
      role: frontendRole,
      agentId: loginData.user.id?.toString() || null,
      email: loginData.email,
      avatarUrl: loginData.user.avatar_url || null,
      permissions: loginData.permissions,
      userData: loginData.user,
      // Campos críticos para regras de negócio
      id: loginData.user.id,
      unidade_id: loginData.user.unidade_id,
      plano: loginData.user.plano
    });


  };

  const logout = () => {
    // Limpar localStorage
    localStorage.removeItem('authToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('userEmail');

    // Limpar estado
    setToken(null);
    setRefreshToken(null);
    setUser({ role: 'none', agentId: null });
  };

  const updateUser = (userData: Partial<User>) => {
    setUser(prev => ({ ...prev, ...userData }));
  };

  const value: AuthContextType = {
    user,
    token,
    refreshToken,
    isAuthenticated,
    isLoading,
    login,
    logout,
    updateUser
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth deve ser usado dentro de um AuthProvider');
  }
  return context;
};
