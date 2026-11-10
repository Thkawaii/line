import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { Spinner } from '../../components/ui';
import { thaiDate } from '../../lib/format';
import PolicyBody from '../../components/PolicyBody';
import { useT } from '../../lib/i18n';

export default function Terms() {
  const { acceptTerms } = useAuth();
  const navigate = useNavigate();
  const t = useT();
  const [policy, setPolicy] = useState(null);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.policy('privacy').then(({ policy }) => setPolicy(policy));
  }, []);

  async function accept() {
    setBusy(true);
    await acceptTerms();
    navigate('/', { replace: true });
  }

  return (
    <div
      className="auth-bg flex min-h-dvh items-center justify-center p-4"
    >
      <div className="flex max-h-[88vh] w-full max-w-sm flex-col rounded-2xl bg-white/90 shadow-pop backdrop-blur-sm">
        {!policy ? (
          <Spinner />
        ) : (
          <>
            <div className="px-5 pt-5">
              <h1 className="text-xl font-bold leading-snug text-ink">{policy.title}</h1>
              <p className="mt-1 text-sm text-muted">
                {t('terms.updatedAt', { date: thaiDate(policy.updated_at, { full: true }) })}
              </p>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <PolicyBody content={policy.content} />
            </div>

            <div className="border-t border-line px-5 py-4">
              <label className="flex cursor-pointer items-start gap-2.5 text-sm text-slate">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-primary"
                />
                <span>{t('terms.agree')}</span>
              </label>

              <button onClick={accept} disabled={!agreed || busy} className="btn-primary mx-auto mt-4 block px-10">
                {t('terms.accept')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
