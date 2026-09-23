import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PartyButton } from '@/components/ui-custom/party-button';
import { VybeMark } from '@/components/brand/vybe-logo';

const NotFound = () => {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center pt-safe pb-safe">
      <VybeMark size={56} />
      <h1 className="font-display text-[64px] font-extrabold leading-none text-party-primary">404</h1>
      {/* Texto propio: antes reutilizaba el de «evento no encontrado» y una
          dirección mal escrita decía que la fiesta había terminado. */}
      <p className="max-w-xs text-body-md text-party-gray">{t('notFound.body')}</p>
      <PartyButton asChild size="lg">
        <Link to="/">{t('common.goHome')}</Link>
      </PartyButton>
    </div>
  );
};

export default NotFound;
