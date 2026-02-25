import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, Zap, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/store/auth.store';
import { Button } from '@/components/ui/button';

export default function GoogleCallbackPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { fetchMe } = useAuthStore();
  const [error, setError] = useState('');

  useEffect(() => {
    const accessToken  = searchParams.get('accessToken');
    const refreshToken = searchParams.get('refreshToken');
    const err          = searchParams.get('error');

    if (err || !accessToken || !refreshToken) {
      setError(t('auth.googleCallback.authFailed'));
      return;
    }

    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    useAuthStore.setState({ accessToken, refreshToken });

    fetchMe()
      .then(() => navigate('/dashboard', { replace: true }))
      .catch(() => {
        setError(t('auth.googleCallback.profileFailed'));
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const Logo = () => (
    <div className="flex items-center justify-center gap-3 mb-6">
      <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary text-primary-foreground"><Zap className="h-5 w-5" /></div>
      <span className="text-xl font-bold text-foreground">{t('common.appName')}</span>
    </div>
  );

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-sm text-center space-y-4">
          <Logo />
          <XCircle className="h-12 w-12 text-destructive mx-auto" />
          <h2 className="text-xl font-semibold text-foreground">{t('auth.googleCallback.errorTitle')}</h2>
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button className="w-full" onClick={() => navigate('/login')}>{t('auth.googleCallback.backToLogin')}</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="text-center space-y-4">
        <Logo />
        <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
        <p className="text-muted-foreground text-sm">{t('auth.googleCallback.loading')}</p>
      </div>
    </div>
  );
}
