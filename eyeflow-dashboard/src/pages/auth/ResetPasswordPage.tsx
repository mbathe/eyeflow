import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Lock, Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authApi } from '@/services/api';
import { Link, useSearchParams } from 'react-router-dom';

type FormValues = { password: string; confirm: string };

export default function ResetPasswordPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [showPwd, setShowPwd] = useState(false);
  const [done, setDone] = useState(false);
  const [serverError, setServerError] = useState('');

  const schema = z.object({
    password: z.string().min(8, t('validation.passwordMin')).regex(/[A-Z]/, t('validation.passwordUpper')).regex(/[0-9]/, t('validation.passwordNumber')),
    confirm: z.string(),
  }).refine((d) => d.password === d.confirm, { message: t('validation.passwordMatch'), path: ['confirm'] });

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormValues) => {
    setServerError('');
    try {
      await authApi.resetPassword(token, data.password);
      setDone(true);
    } catch {
      setServerError(t('auth.resetPassword.serverError'));
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <p className="text-muted-foreground text-sm">{t('auth.resetPassword.invalidLink')}</p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-md text-center space-y-4">
          <div className="flex justify-center">
            <div className="h-16 w-16 rounded-full bg-success/15 flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-success" />
            </div>
          </div>
          <h1 className="text-xl font-bold text-foreground">{t('auth.resetPassword.done.title')}</h1>
          <p className="text-muted-foreground text-sm">{t('auth.resetPassword.done.description')}</p>
          <Link to="/login" className="inline-flex items-center gap-2 text-sm text-primary hover:underline font-medium">
            {t('auth.resetPassword.done.loginLink')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="inline-flex items-center gap-2 mb-6">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-white font-bold text-sm">E</span>
            </div>
            <span className="text-xl font-bold text-foreground">{t('common.appName')}</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground">{t('auth.resetPassword.title')}</h1>
          <p className="text-muted-foreground mt-1 text-sm">{t('auth.resetPassword.subtitle')}</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 bg-card border border-border rounded-xl p-6">
          <div className="space-y-2">
            <Label htmlFor="password">{t('auth.resetPassword.newPasswordLabel')}</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input id="password" type={showPwd ? 'text' : 'password'} placeholder="••••••••" className="pl-9 pr-10" {...register('password')} />
              <button type="button" onClick={() => setShowPwd(!showPwd)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm">{t('auth.resetPassword.confirmLabel')}</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input id="confirm" type="password" placeholder="••••••••" className="pl-9" {...register('confirm')} />
            </div>
            {errors.confirm && <p className="text-xs text-destructive">{errors.confirm.message}</p>}
          </div>

          {serverError && <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">{serverError}</p>}
          <Button type="submit" className="w-full" loading={isSubmitting}>{t('auth.resetPassword.submit')}</Button>
        </form>
      </div>
    </div>
  );
}
