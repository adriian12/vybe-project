
import { User } from '@/types/user';
import { Link } from 'react-router-dom';

interface MatchListItemProps {
  match: User;
  lastMessage?: string;
}

const MatchListItem: React.FC<MatchListItemProps> = ({ match, lastMessage }) => {
  return (
    <Link to={`/chat/${match.id}`} className="flex items-center p-4 border-b border-party-dark hover:bg-party-dark/50 transition-colors">
      <div className="w-14 h-14 rounded-full overflow-hidden mr-4">
        <img 
          src={match.photos[0]} 
          alt={match.name} 
          className="w-full h-full object-cover"
        />
      </div>
      <div className="flex-1">
        <h3 className="text-lg font-semibold mb-1">{match.name}</h3>
        <p className="text-sm text-party-gray truncate">
          {lastMessage || "Aún no hay mensajes. ¡Inicia la conversación!"}
        </p>
      </div>
      <div className="text-xs text-party-gray">
        {match.lastActive}
      </div>
    </Link>
  );
};

export default MatchListItem;
