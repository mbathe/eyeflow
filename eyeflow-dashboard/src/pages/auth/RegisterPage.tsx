import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Zap, Mail, Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useAuthStore } from '@/store/auth.store';

type FormData = { firstName: string; lastName: string; email: string; password: string; confirm: string };

export default function RegisterPage() {
  const { t } = useTranslation();
  const { register: registerUser, isLoading, error, clearError } = useAuthStore();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState('');

  const schema = z.object({
    firstName: z.string().min(2, t('validation.firstNameMin')),
    lastName: z.string().min(2, t('validation.lastNameMin')),
    email: z.string().email(t('validation.emailInvalid')),
    password: z.string().min(8, t('validation.passwordMin')).regex(/[A-Z]/, t('validation.passwordUpper')).regex(/[0-9]/, t('validation.passwordNumber')),
    confirm: z.string(),
  }).refine((d) => d.password === d.confirm, { message: t('validation.passwordMatch'), path: ['confirm'] });

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    clearError();
    try {
      await registerUser({ firstName: data.firstName, lastName: data.lastName, email: data.email, password: data.password });
      const currentUser = useAuthStore.getState().user;
      if (currentUser && !currentUser.emailVerified) { setRegisteredEmail(data.email); } else { navigate('/dashboard'); }
    } catch { /* error is set in store */ }
  };

  const BgGrid = () => <div className="absolute inset-0 bg-[linear-gradient(rgba(59,130,246,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(59,130,246,0.03)_1px,transparent_1px)] bg-[size:64px_64px] pointer-events-none" />;
  const Logo = () => (
    <div className="flex items-center justify-center gap-3 mb-8">
      <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary text-primary-foreground"><Zap className="h-5 w-5" /></div>
      <span className="text-xl font-bold text-foreground">{t('common.appName')}</span>
    </div>
  );

  if (registeredEmail) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <BgGrid />
        <div className="w-full max-w-md relative text-center space-y-6">
          <Logo />
          <Card>
            <CardContent className="pt-8 pb-8 flex flex-col items-center gap-4">
              <div className="h-16 w-16 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center">
                <Mail className="h-7 w-7 text-primary" />
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-bold text-foreground">{t('auth.register.emailSent.title')}</h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {t('auth.register.emailSent.sentTo')}<br />
                  <span className="text-foreground font-medium">{registeredEmail}</span>
                </p>
                <p className="text-xs text-muted-foreground">{t('auth.register.emailSent.hint')}</p>
              </div>
              <div className="flex flex-col w-full gap-2 pt-2">
                <Button onClick={() => navigate('/login')} className="w-full">
                  <CheckCircle2 className="h-4 w-4 mr-2" />{t('auth.register.emailSent.goToLogin')}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')} className="w-full text-muted-foreground">
                  {t('auth.register.emailSent.skip')}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <BgGrid />
      <div className="w-full max-w-md relative">
        <Logo />
        <Card>
          <CardHeader className="text-center pb-6">
            <CardTitle className="text-2xl">{t('auth.register.title')}</CardTitle>
            <CardDescription>{t('auth.register.subtitle')}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              {error && <div className="rounded-md bg-destructive/10 border border-destructive/30 px-4 py-3 text-sm text-destructive">{error}</div>}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="firstName">{t('auth.register.firstName')}</Label>
                  <Input id="firstName" placeholder="Alice" {...register('firstName')} />
                  {errors.firstName && <p className="text-xs text-destructive">{errors.firstName.message}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lastName">{t('auth.register.lastName')}</Label>
                  <Input id="lastName" placeholder="Dupont" {...register('lastName')} />
                  {errors.lastName && <p className="text-xs text-destructive">{errors.lastName.message}</p>}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="email">{t('common.email')}</Label>
                <Input id="email" type="email" placeholder="alice@exemple.com" {...register('email')} />
                {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password">{t('common.password')}</Label>
                <div className="relative">
                  <Input id="password" type={showPassword ? 'text' : 'password'} placeholder={t('auth.register.passwordPlaceholder')} className="pr-10" {...register('password')} />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" tabIndex={-1}>
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirm">{t('auth.register.confirmPassword')}</Label>
                <Input id="confirm" type="password" placeholder="••••••••" {...register('confirm')} />
                {errors.confirm && <p className="text-xs text-destructive">{errors.confirm.message}</p>}
              </div>

              <Button type="submit" className="w-full" loading={isLoading}>{t('auth.register.submit')}</Button>
            </form>

            <p className="mt-4 text-center text-sm text-muted-foreground">
              {t('auth.register.haveAccount')}{' '}
              <Link to="/login" className="text-primary hover:underline font-medium">{t('auth.register.loginLink')}</Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
