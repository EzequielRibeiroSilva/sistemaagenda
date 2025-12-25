
import React, { useState } from 'react';
import { Mail, Lock, Eye, EyeOff, Check } from './Icons';

interface LoginPageProps {
    onLoginSuccess: (userData: {
        email: string;
        role: string;
        redirectTo: string;
        permissions: any;
        token: string;
        user: any;
    }) => void;
}

const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [rememberMe, setRememberMe] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');

        // Validação básica no frontend
        if (!email || !password) {
            setError('Por favor, preencha todos os campos');
            setIsLoading(false);
            return;
        }

        if (!email.includes('@')) {
            setError('Por favor, insira um email válido');
            setIsLoading(false);
            return;
        }

        try {
            const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';

            const response = await fetch(`${apiBaseUrl}/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    email: email.trim().toLowerCase(),
                    senha: password
                }),
            });

            const data = await response.json();

            if (response.ok && data.success) {
                // Salvar tokens no localStorage se "Lembrar-me" estiver marcado
                if (rememberMe) {
                    localStorage.setItem('authToken', data.data.token);
                    localStorage.setItem('userEmail', data.data.user.email);

                    // Salvar refresh token se disponível
                    if (data.data.refreshToken) {
                        localStorage.setItem('refreshToken', data.data.refreshToken);
                    }
                }


                // Chamar callback de sucesso com dados da API
                onLoginSuccess({
                    email: data.data.user.email,
                    role: data.data.user.role,
                    redirectTo: data.data.redirectTo,
                    permissions: data.data.user.permissions,
                    token: data.data.token,
                    user: data.data.user
                });
            } else {
                // Tratar diferentes tipos de erro do backend de forma profissional
                let errorMessage = 'Erro ao fazer login';

                switch (response.status) {
                    case 400:
                        errorMessage = data.message || 'Dados inválidos. Verifique os campos preenchidos';
                        break;
                    case 401:
                        errorMessage = 'Email ou senha incorretos';
                        break;
                    case 403:
                        errorMessage = 'Acesso negado. Conta pode estar desativada';
                        break;
                    case 429:
                        errorMessage = 'Muitas tentativas de login. Aguarde alguns minutos antes de tentar novamente';
                        break;
                    case 500:
                    case 502:
                    case 503:
                    case 504:
                        errorMessage = 'Serviço temporariamente indisponível. Tente novamente em alguns instantes';
                        break;
                    default:
                        errorMessage = data.message || data.error || 'Erro inesperado. Tente novamente';
                }

                setError(errorMessage);
            }
        } catch (error) {
            // Verificar se é erro de rede
            if (error instanceof TypeError && error.message.includes('fetch')) {
                setError('Erro de conexão. Verifique sua internet e tente novamente');
            } else {
                setError('Erro inesperado. Tente novamente em alguns instantes');
            }
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4" style={{ minHeight: '100dvh' }}>
            <div className="max-w-md w-full bg-white p-8 rounded-xl shadow-lg border border-gray-200">
                <div className="text-center mb-8">
                    <h1 className="font-genty text-5xl font-bold tracking-wide" style={{ color: '#2663EB' }}>Tally</h1>
                    <p className="text-gray-500 mt-2">Faça login na sua conta</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    {error && (
                        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                            {error}
                        </div>
                    )}

                    <div>
                        <label htmlFor="email" className="text-sm font-medium text-gray-700">Email</label>
                        <div className="mt-1 relative">
                             <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <Mail className="w-5 h-5 text-gray-400" />
                            </div>
                            <input
                                id="email"
                                name="email"
                                type="email"
                                autoComplete="email"
                                required
                                disabled={isLoading}
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="seu@email.com"
                                className="w-full bg-white pl-10 pr-3 py-3 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-500 focus:ring-blue-500 focus:border-blue-500 transition-colors disabled:bg-gray-50 disabled:text-gray-500"
                            />
                        </div>
                    </div>

                    <div>
                         <label htmlFor="password" className="text-sm font-medium text-gray-700">Senha</label>
                        <div className="mt-1 relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <Lock className="w-5 h-5 text-gray-400" />
                            </div>
                            <input
                                id="password"
                                name="password"
                                type={showPassword ? 'text' : 'password'}
                                autoComplete="current-password"
                                required
                                disabled={isLoading}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Sua senha"
                                className="w-full bg-white pl-10 pr-10 py-3 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-500 focus:ring-blue-500 focus:border-blue-500 transition-colors disabled:bg-gray-50 disabled:text-gray-500"
                            />
                            <button
                                type="button"
                                disabled={isLoading}
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 disabled:text-gray-300"
                                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                            >
                                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                            </button>
                        </div>
                    </div>

                    <div className="flex items-center justify-between text-sm">
                        <label className="flex items-center cursor-pointer select-none" htmlFor="remember-me">
                            <input
                                id="remember-me"
                                name="remember-me"
                                type="checkbox"
                                checked={rememberMe}
                                onChange={() => setRememberMe(!rememberMe)}
                                className="sr-only peer"
                            />
                            <div className="w-4 h-4 flex-shrink-0 flex items-center justify-center border-2 border-gray-300 rounded-sm bg-white peer-checked:bg-blue-600 peer-checked:border-blue-600 transition-colors">
                                {rememberMe && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                            </div>
                            <span className="ml-2 block text-gray-700">
                                Lembrar-me
                            </span>
                        </label>

                        <div className="font-medium">
                            <a href="#" className="text-blue-600 hover:text-blue-500">
                                Esqueceu a senha?
                            </a>
                        </div>
                    </div>

                    <div>
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors disabled:bg-blue-400 disabled:cursor-not-allowed"
                        >
                            {isLoading ? (
                                <div className="flex items-center">
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                                    Entrando...
                                </div>
                            ) : (
                                'Entrar'
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default LoginPage;
