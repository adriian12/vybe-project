
import React from "react";
import { Crown, Star, MessageSquare, Eye, Filter } from "lucide-react";
import { PartyButton } from "./ui-custom/party-button";

interface PremiumFeatureProps {
  icon: React.ReactNode;
  title: string;
  description: string;
}

const PremiumFeature: React.FC<PremiumFeatureProps> = ({ icon, title, description }) => {
  return (
    <div className="flex items-start p-3 border-b border-muted last:border-0">
      <div className="text-party-accent mr-3">{icon}</div>
      <div>
        <h3 className="font-medium mb-1">{title}</h3>
        <p className="text-sm text-party-gray">{description}</p>
      </div>
    </div>
  );
};

interface PremiumFeaturesProps {
  isOpen: boolean;
  onClose: () => void;
  onSubscribe: () => void;
}

const PremiumFeatures: React.FC<PremiumFeaturesProps> = ({ isOpen, onClose, onSubscribe }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-xl max-w-md w-full overflow-hidden">
        <div className="bg-gradient-to-r from-party-primary to-party-accent p-4 text-white text-center">
          <Crown className="mx-auto mb-2" size={32} />
          <h2 className="text-xl font-bold">Vybe Premium</h2>
          <p className="opacity-90">Desbloquea la experiencia completa</p>
        </div>
        
        <div className="p-2">
          <PremiumFeature 
            icon={<Star size={24} />}
            title="Super Likes"
            description="Destaca tu perfil para que te vean primero"
          />
          
          <PremiumFeature 
            icon={<MessageSquare size={24} />}
            title="Mensajes directos"
            description="Envía mensajes sin necesidad de hacer match"
          />
          
          <PremiumFeature 
            icon={<Eye size={24} />}
            title="Modo VIP"
            description="Ve quién te ha dado me gusta antes de decidir"
          />
          
          <PremiumFeature 
            icon={<Filter size={24} />}
            title="Filtros avanzados"
            description="Busca por intereses, edad o estilo de fiesta"
          />
        </div>
        
        <div className="p-4 space-y-3">
          <p className="text-center font-bold text-xl">19,99€ / mes</p>
          <p className="text-center text-sm text-party-gray">
            También disponible como pase VIP por evento desde 4,99€
          </p>
          
          <div className="flex space-x-3">
            <PartyButton variant="outline" className="flex-1" onClick={onClose}>
              Más tarde
            </PartyButton>
            <PartyButton variant="gradient" className="flex-1" onClick={onSubscribe}>
              Suscribirme
            </PartyButton>
          </div>
        </div>
        
        <p className="text-xs text-center text-party-gray p-3 border-t border-muted">
          Oferta exclusiva para Mallorca. Cancela en cualquier momento.
        </p>
      </div>
    </div>
  );
};

export default PremiumFeatures;
