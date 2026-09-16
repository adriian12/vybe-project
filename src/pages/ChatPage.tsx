import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ChatWindow from '@/components/chat-window';
import Header from '@/components/header';
import Footer from '@/components/footer';
import { PartyButton } from '@/components/ui-custom/party-button';

const ChatPage = () => {
  const { userId } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();

  // La autenticación la garantiza ProtectedRoute; aquí sólo falta comprobar
  // que la URL trae una conversación.
  if (!userId) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 p-4">
        <h1 className="font-display text-headline-lg">{t('chat.noConversation')}</h1>
        <PartyButton onClick={() => navigate('/matches')}>{t('chat.backToMatches')}</PartyButton>
      </div>
    );
  }

  // El chat ocupa exactamente el hueco entre la cabecera y la barra de abajo:
  // así el campo de escribir queda siempre a la vista, también con el teclado.
  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden pb-16 pt-16">
      <Header />
      <div className="mx-auto w-full max-w-2xl flex-1 overflow-hidden">
        <ChatWindow matchId={userId} />
      </div>
      <Footer />
    </div>
  );
};

export default ChatPage;
