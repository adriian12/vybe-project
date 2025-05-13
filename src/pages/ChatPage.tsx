
import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAppContext } from "@/context/app-context";
import ChatWindow from "@/components/chat-window";

const ChatPage = () => {
  const { userId } = useParams();
  const { isLoggedIn, userType } = useAppContext();
  const navigate = useNavigate();

  // Verificar si el usuario está autenticado
  useEffect(() => {
    if (!isLoggedIn) {
      navigate("/auth");
    } else if (userType !== 'user') {
      navigate("/home");
    }
  }, [isLoggedIn, userType, navigate]);

  if (!userId) {
    return (
      <div className="flex flex-col items-center justify-center h-screen p-4">
        <h1 className="text-2xl font-bold mb-4">No se encontró la conversación</h1>
        <button
          onClick={() => navigate("/matches")}
          className="px-4 py-2 bg-party-primary text-white rounded-lg"
        >
          Volver a Mis Vybes
        </button>
      </div>
    );
  }

  return (
    <div className="h-screen overflow-hidden">
      <ChatWindow matchId={userId} />
    </div>
  );
};

export default ChatPage;
