import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Mail, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authApi } from '@/services/api';
import { Link } from 'react-router-dom';

type FormValues = { email: string };

export default function ForgotPasswordPage() {
  const { t } = useTranslation();
  const [sent, setSent] = useState(false);
  const [serverError, setServerError] = useState('');

  const schema = z.object({ email: z.string().email(t('validation.emailInvalid')) });
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormValues) => {
    setServerError('');
    try {
      await authApi.forgotPassword(data.email);
      setSent(true);
    } catch {
      setServerError(t('auth.forgotPassword.serverError'));
    }
  };

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-md text-center space-y-4">
          <div className="flex justify-center">
            <div className="h-16 w-16 rounded-full bg-success/15 flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-success" />
            </div>
          </div>
          <h1 className="text-xl font-bold text-foreground">{t('auth.forgotPassword.sent.title')}</h1>
          <p className="text-muted-foreground text-sm">{t('auth.forgotPassword.sent.description')}</p>
          <Link to="/login" className="inline-flex items-center gap-2 text-sm text-primary hover:underline">
            <ArrowLeft className="h-4 w-4" />{t('common.backToLogin')}
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
          <h1 className="text-2xl font-bold text-foreground">{t('auth.forgotPassword.title')}</h1>
          <p className="text-muted-foreground mt-1 text-sm">{t('auth.forgotPassword.subtitle')}</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 bg-card border border-border rounded-xl p-6">
          <div className="space-y-2">
            <Label htmlFor="email">{t('auth.forgotPassword.emailLabel')}</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input id="email" type="email" placeholder={t('auth.forgotPassword.emailPlaceholder')} className="pl-9" {...register('email')} />
            </div>
            {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
          </div>
          {serverError && <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">{serverError}</p>}
          <Button type="submit" className="w-full" loading={isSubmitting}>{t('auth.forgotPassword.submit')}</Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          <Link to="/login" className="inline-flex items-center gap-1 text-primary hover:underline">
            <ArrowLeft className="h-3 w-3" />{t('common.backToLogin')}
          </Link>
        </p>
      </div>
    </div>
  );
}
