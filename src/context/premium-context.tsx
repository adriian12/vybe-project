
import { createContext, useState, useContext, ReactNode } from "react";

interface PremiumContextType {
  isPremium: boolean;
  showPremiumDialog: boolean;
  setShowPremiumDialog: (show: boolean) => void;
  upgradeToPremium: () => Promise<boolean>;
  getPremiumForEvent: () => Promise<boolean>;
  premiumFeatures: {
    superLikes: number;
    directMessages: number;
    seeWhoLikedYou: boolean;
    advancedFilters: boolean;
  };
}

const PremiumContext = createContext<PremiumContextType | undefined>(undefined);

export const usePremium = () => {
  const context = useContext(PremiumContext);
  if (context === undefined) {
    throw new Error("usePremium debe ser usado dentro de un PremiumProvider");
  }
  return context;
};

export const PremiumProvider = ({ children }: { children: ReactNode }) => {
  const [isPremium, setIsPremium] = useState(false);
  const [showPremiumDialog, setShowPremiumDialog] = useState(false);
  const [premiumFeatures, setPremiumFeatures] = useState({
    superLikes: 0,
    directMessages: 0,
    seeWhoLikedYou: false,
    advancedFilters: false,
  });

  // En un caso real, estas funciones se conectarían a la API de pagos
  const upgradeToPremium = async (): Promise<boolean> => {
    // Simulación de proceso de pago para suscripción mensual
    setIsPremium(true);
    setPremiumFeatures({
      superLikes: 5,
      directMessages: 10,
      seeWhoLikedYou: true,
      advancedFilters: true,
    });
    return true;
  };

  const getPremiumForEvent = async (): Promise<boolean> => {
    // Simulación de proceso de pago para evento único
    setIsPremium(true);
    setPremiumFeatures({
      superLikes: 3,
      directMessages: 5,
      seeWhoLikedYou: true,
      advancedFilters: false,
    });
    return true;
  };

  const value = {
    isPremium,
    showPremiumDialog,
    setShowPremiumDialog,
    upgradeToPremium,
    getPremiumForEvent,
    premiumFeatures,
  };

  return <PremiumContext.Provider value={value}>{children}</PremiumContext.Provider>;
};
