import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useAuthStore } from '@/store/auth.store';

type FormData = { email: string; password: string };

export default function LoginPage() {
  const { t } = useTranslation();
  const [showPassword, setShowPassword] = useState(false);
  const { login, isLoading, error, clearError } = useAuthStore();
  const navigate = useNavigate();

  const schema = z.object({
    email: z.string().email(t('validation.emailInvalid')),
    password: z.string().min(1, t('validation.passwordRequired')),
  });

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    clearError();
    try {
      await login(data.email, data.password);
      navigate('/dashboard');
    } catch { /* error is set in store */ }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(59,130,246,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(59,130,246,0.03)_1px,transparent_1px)] bg-[size:64px_64px] pointer-events-none" />
      <div className="w-full max-w-md relative">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary text-primary-foreground">
            <Zap className="h-5 w-5" />
          </div>
          <span className="text-xl font-bold text-foreground">{t('common.appName')}</span>
        </div>

        <Card>
          <CardHeader className="text-center pb-6">
            <CardTitle className="text-2xl">{t('auth.login.title')}</CardTitle>
            <CardDescription>{t('auth.platformSubtitle')}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              {error && (
                <div className="rounded-md bg-destructive/10 border border-destructive/30 px-4 py-3 text-sm text-destructive">{error}</div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="email">{t('common.email')}</Label>
                <Input id="email" type="email" placeholder={t('auth.login.emailPlaceholder')} autoComplete="email" {...register('email')} />
                {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">{t('auth.login.passwordLabel')}</Label>
                  <Link to="/forgot-password" className="text-xs text-primary hover:underline">
                    {t('auth.login.forgotPassword')}
                  </Link>
                </div>
                <div className="relative">
                  <Input id="password" type={showPassword ? 'text' : 'password'} placeholder="••••••••" autoComplete="current-password" className="pr-10" {...register('password')} />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" tabIndex={-1}>
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
              </div>

              <Button type="submit" className="w-full" loading={isLoading}>{t('auth.login.submit')}</Button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">{t('common.or')}</span>
                </div>
              </div>

              <a
                href={`${import.meta.env.VITE_API_URL ?? 'http://localhost:3000'}/auth/google`}
                className="flex items-center justify-center gap-2 w-full h-9 px-4 rounded-md border border-border bg-transparent hover:bg-secondary text-sm font-medium transition-colors"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                {t('auth.login.googleButton')}
              </a>
            </form>

            <p className="mt-4 text-center text-sm text-muted-foreground">
              {t('auth.login.noAccount')}{' '}
              <Link to="/register" className="text-primary hover:underline font-medium">{t('auth.login.registerLink')}</Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
