import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { CheckCircle2, XCircle, Loader2, Zap, MailCheck, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { authApi } from '@/services/api';
import { useAuthStore } from '@/store/auth.store';
import { Button } from '@/components/ui/button';

export default function VerifyEmailPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token');
  const { user, fetchMe } = useAuthStore();
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>(token ? 'loading' : 'idle');
  const [resendStatus, setResendStatus] = useState<'' | 'sending' | 'sent' | 'error'>('');

  useEffect(() => {
    if (!token) return;
    authApi.verifyEmail(token).then(async () => { await fetchMe(); setStatus('success'); }).catch(() => setStatus('error'));
  }, [token]);

  const handleResend = async () => {
    setResendStatus('sending');
    try { await authApi.resendVerification(); setResendStatus('sent'); } catch { setResendStatus('error'); }
  };

  const Logo = () => (
    <div className="flex items-center justify-center gap-3 mb-6">
      <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary text-primary-foreground"><Zap className="h-5 w-5" /></div>
      <span className="text-xl font-bold text-foreground">{t('common.appName')}</span>
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm text-center space-y-4">
        <Logo />

        {!token && (
          <div className="space-y-4">
            <MailCheck className="h-12 w-12 text-primary mx-auto" />
            <h2 className="text-xl font-semibold text-foreground">{t('auth.verifyEmail.title')}</h2>
            {user ? (
              <>
                <p className="text-muted-foreground text-sm">
                  {t('auth.verifyEmail.sentTo')}{' '}
                  <span className="text-foreground font-medium">{user.email}</span>.<br />
                  {t('auth.verifyEmail.notReceived')}
                </p>
                {resendStatus === 'sent' && <div className="text-sm text-success bg-success/10 rounded-md px-3 py-2">{t('auth.verifyEmail.resentSuccess')}</div>}
                {resendStatus === 'error' && <div className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">{t('auth.verifyEmail.resentError')}</div>}
                <Button onClick={handleResend} disabled={resendStatus === 'sending' || resendStatus === 'sent'} variant="outline" className="w-full">
                  {resendStatus === 'sending'
                    ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />{t('auth.verifyEmail.resending')}</>
                    : <><RefreshCw className="h-4 w-4 mr-2" />{t('auth.verifyEmail.resend')}</>}
                </Button>
                <Button onClick={() => navigate('/dashboard')} className="w-full">{t('auth.verifyEmail.continueToDashboard')}</Button>
              </>
            ) : (
              <>
                <p className="text-muted-foreground text-sm">{t('auth.verifyEmail.loginToResend')}</p>
                <Button onClick={() => navigate('/login')} className="w-full">{t('auth.verifyEmail.ctaLogin')}</Button>
              </>
            )}
          </div>
        )}

        {status === 'loading' && (
          <><Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" /><p className="text-muted-foreground">{t('auth.verifyEmail.verifying')}</p></>
        )}

        {status === 'success' && (
          <>
            <CheckCircle2 className="h-12 w-12 text-success mx-auto" />
            <h2 className="text-xl font-semibold text-foreground">{t('auth.verifyEmail.success.title')}</h2>
            <p className="text-muted-foreground text-sm">{t('auth.verifyEmail.success.description')}</p>
            <Button className="w-full" onClick={() => navigate(user ? '/dashboard' : '/login')}>
              {user ? t('auth.verifyEmail.ctaDashboard') : t('auth.verifyEmail.ctaLogin')}
            </Button>
          </>
        )}

        {status === 'error' && (
          <>
            <XCircle className="h-12 w-12 text-destructive mx-auto" />
            <h2 className="text-xl font-semibold text-foreground">{t('auth.verifyEmail.error.title')}</h2>
            <p className="text-muted-foreground text-sm">{t('auth.verifyEmail.error.description')}</p>
            <div className="flex flex-col gap-2">
              {user && (
                <Button onClick={handleResend} variant="outline" className="w-full" disabled={resendStatus === 'sending' || resendStatus === 'sent'}>
                  <RefreshCw className="h-4 w-4 mr-2" />{t('auth.verifyEmail.error.resendButton')}
                </Button>
              )}
              <Link to={user ? '/dashboard' : '/login'} className="block">
                <Button variant={user ? 'ghost' : 'default'} className="w-full">
                  {user ? t('auth.verifyEmail.ctaDashboard') : t('auth.verifyEmail.ctaBackToLogin')}
                </Button>
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
