
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAppContext } from "@/context/app-context";
import Header from "@/components/header";
import Footer from "@/components/footer";
import ProfileCard from "@/components/profile-card";
import MatchDialog from "@/components/match-dialog";
import { User } from "@/types/user";

const HomePage = () => {
  const { isLoggedIn, isLocationVerified, isEventVerified, currentProfile, handleSwipeLeft, handleSwipeRight } = useAppContext();
  const [showMatchDialog, setShowMatchDialog] = useState(false);
  const [matchedUser, setMatchedUser] = useState<User | null>(null);
  const navigate = useNavigate();

  // Verificar que el usuario ha iniciado sesión y verificado ubicación/evento
  useEffect(() => {
    if (!isLoggedIn) {
      navigate("/auth");
    } else if (!isLocationVerified || !isEventVerified) {
      navigate("/location");
    }
  }, [isLoggedIn, isLocationVerified, isEventVerified, navigate]);

  const handleSwipe = async (direction: "left" | "right", userId: string) => {
    if (direction === "left") {
      handleSwipeLeft(userId);
    } else {
      const result = await handleSwipeRight(userId);
      // Check if the result is specifically true (boolean)
      if (result === true && currentProfile) {
        setMatchedUser(currentProfile);
        setShowMatchDialog(true);
      }
    }
  };

  return (
    <div className="min-h-screen pb-16 pt-16">
      <Header />
      
      <main className="p-4 flex flex-col items-center justify-center min-h-[calc(100vh-8rem)]">
        {currentProfile ? (
          <ProfileCard 
            user={currentProfile}
            onSwipeLeft={(userId) => handleSwipe("left", userId)}
            onSwipeRight={(userId) => handleSwipe("right", userId)}
          />
        ) : (
          <div className="text-center p-8">
            <h2 className="text-2xl font-bold mb-4">¡No hay más perfiles!</h2>
            <p className="text-party-gray mb-6">
              No hay más personas disponibles en este momento. 
              Vuelve a intentarlo más tarde o prueba en otro evento.
            </p>
            <div className="w-32 h-32 rounded-full bg-party-dark flex items-center justify-center mx-auto">
              <span className="text-5xl">🎉</span>
            </div>
          </div>
        )}
      </main>
      
      <MatchDialog 
        isOpen={showMatchDialog} 
        onClose={() => setShowMatchDialog(false)} 
        matchedUser={matchedUser}
        matchName="Vibe Check"
      />
      
      <Footer />
    </div>
  );
};

export default HomePage;
