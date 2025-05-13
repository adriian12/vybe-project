
import { useState, useEffect, useRef } from 'react';
import { useAppContext } from '@/context/app-context';
import { User, Message } from '@/types/user';
import { Send, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface ChatWindowProps {
  matchId: string;
}

const ChatWindow: React.FC<ChatWindowProps> = ({ matchId }) => {
  const { connections, messages, sendMessage } = useAppContext();
  const [inputMessage, setInputMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  
  const match = connections.find(u => u.id === matchId);
  const chatMessages = messages[matchId] || [];
  
  // Scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [chatMessages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim()) return;
    
    const success = await sendMessage(matchId, inputMessage);
    if (success) {
      setInputMessage('');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSendMessage();
    }
  };

  if (!match) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4">
        <p>No se encontró el chat</p>
        <button
          onClick={() => navigate('/matches')}
          className="mt-4 px-4 py-2 bg-party-primary text-white rounded-lg"
        >
          Volver
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-party-dark-2">
      {/* Header */}
      <div className="flex items-center p-4 bg-party-dark text-white border-b border-party-dark-2">
        <button 
          onClick={() => navigate('/matches')}
          className="mr-3"
        >
          <ArrowLeft size={24} />
        </button>
        <div className="w-10 h-10 rounded-full overflow-hidden">
          <img src={match.photos[0]} alt={match.name} className="w-full h-full object-cover" />
        </div>
        <div className="ml-3">
          <h3 className="font-semibold">{match.name}</h3>
          <p className="text-xs text-party-gray">{match.lastActive}</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {chatMessages.length === 0 ? (
          <div className="text-center py-8 text-party-gray">
            <p>Aún no hay mensajes</p>
            <p className="text-sm mt-2">¡Inicia la conversación!</p>
          </div>
        ) : (
          chatMessages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.senderId === matchId ? 'justify-start' : 'justify-end'}`}
            >
              <div
                className={`max-w-[80%] rounded-lg px-4 py-2 ${
                  msg.senderId === matchId
                    ? 'bg-party-dark text-white'
                    : 'bg-party-primary text-white'
                }`}
              >
                <p>{msg.content}</p>
                <p className="text-xs opacity-70 text-right mt-1">
                  {new Date(msg.createdAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-party-dark-2">
        <div className="flex bg-party-dark rounded-full overflow-hidden">
          <input
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Escribe un mensaje..."
            className="flex-1 bg-transparent text-white p-3 outline-none"
          />
          <button
            onClick={handleSendMessage}
            disabled={!inputMessage.trim()}
            className={`p-3 ${
              !inputMessage.trim() ? 'text-party-gray' : 'text-party-primary'
            }`}
          >
            <Send size={20} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatWindow;
