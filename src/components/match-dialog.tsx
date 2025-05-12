
import React from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { User } from '@/types/user';
import { PartyButton } from './ui-custom/party-button';

interface MatchDialogProps {
  isOpen: boolean;
  onClose: () => void;
  matchedUser: User | null;
}

const MatchDialog: React.FC<MatchDialogProps> = ({ isOpen, onClose, matchedUser }) => {
  if (!matchedUser) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md bg-party-dark border-party-primary">
        <div className="text-center py-6">
          <div className="match-gradient text-transparent bg-clip-text text-4xl font-bold mb-8 animate-pulse-soft">
            ¡Conexión Única!
          </div>
          
          <div className="flex justify-center space-x-4 mb-8">
            <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-party-primary">
              <img 
                src="https://i.pravatar.cc/150?img=32" 
                alt="Tu foto" 
                className="w-full h-full object-cover"
              />
            </div>
            <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-party-accent">
              <img 
                src={matchedUser.photos[0]} 
                alt={matchedUser.name} 
                className="w-full h-full object-cover"
              />
            </div>
          </div>
          
          <p className="text-lg mb-6">
            Tú y <span className="font-bold text-party-primary">{matchedUser.name}</span> tienen una conexión. ¡Inicien una conversación ahora!
          </p>
          
          <div className="flex justify-center space-x-4">
            <PartyButton variant="outline" onClick={onClose}>
              Seguir descubriendo
            </PartyButton>
            <PartyButton variant="gradient">
              Enviar mensaje
            </PartyButton>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default MatchDialog;
