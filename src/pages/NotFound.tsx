import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PartyButton } from '@/components/ui-custom/party-button';
import { VybeMark } from '@/components/brand/vybe-logo';

const NotFound = () => {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <VybeMark size={56} />
      <h1 className="font-display text-[64px] font-extrabold leading-none text-party-primary">404</h1>
      <p className="max-w-xs text-body-md text-party-gray">{t('eventAccess.notFoundBody')}</p>
      <PartyButton asChild size="lg">
        <Link to="/">{t('common.goHome')}</Link>
      </PartyButton>
    </div>
  );
};

export default NotFound;
