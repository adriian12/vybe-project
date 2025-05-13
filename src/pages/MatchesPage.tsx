
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAppContext } from "@/context/app-context";
import ConnectionListItem from "@/components/connection-list-item";
import { Bell } from "lucide-react";

const MatchesPage = () => {
  const { isLoggedIn, connections, messages } = useAppContext();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoggedIn) {
      navigate("/auth");
    }
  }, [isLoggedIn, navigate]);

  // Obtener el último mensaje para cada conexión
  const getLastMessage = (userId: string): string | undefined => {
    const userMessages = messages[userId];
    if (!userMessages || userMessages.length === 0) return undefined;
    
    // Ordenar por fecha y obtener el último
    const sortedMessages = [...userMessages].sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    
    return sortedMessages[0].content;
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="h-16 flex items-center justify-center bg-background/80 backdrop-blur-md border-b border-border">
        <h1 className="text-xl font-bold">Mis Vybes</h1>
      </header>

      <div className="flex-grow py-4">
        {connections.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-4 text-center">
            <Bell size={48} className="mb-4 text-party-primary" />
            <h2 className="text-xl font-semibold mb-2">Aún no tienes conexiones</h2>
            <p className="text-party-gray">
              Comienza a explorar perfiles y realiza Vybe Check para conocer gente nueva
            </p>
          </div>
        ) : (
          <div className="divide-y divide-party-dark/20">
            {connections.map((connection) => (
              <ConnectionListItem 
                key={connection.id} 
                connection={connection}
                lastMessage={getLastMessage(connection.id)} 
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MatchesPage;
