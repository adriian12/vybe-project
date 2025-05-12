
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAppContext } from "@/context/app-context";
import Header from "@/components/header";
import Footer from "@/components/footer";
import MatchListItem from "@/components/match-list-item";

const MatchesPage = () => {
  const { isLoggedIn, isLocationVerified, isEventVerified, matches } = useAppContext();
  const navigate = useNavigate();

  // Verificar que el usuario ha iniciado sesión y verificado ubicación/evento
  useEffect(() => {
    if (!isLoggedIn) {
      navigate("/auth");
    } else if (!isLocationVerified || !isEventVerified) {
      navigate("/location");
    }
  }, [isLoggedIn, isLocationVerified, isEventVerified, navigate]);

  return (
    <div className="min-h-screen pb-16 pt-16">
      <Header />
      
      <main className="max-w-lg mx-auto">
        <div className="p-4 border-b border-border">
          <h1 className="text-xl font-bold">Tus conexiones</h1>
        </div>
        
        {matches.length > 0 ? (
          <div className="divide-y divide-border">
            {matches.map((match) => (
              <MatchListItem key={match.id} match={match} />
            ))}
          </div>
        ) : (
          <div className="text-center p-8">
            <div className="w-20 h-20 bg-party-dark rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">💫</span>
            </div>
            <h2 className="text-xl font-bold mb-2">Sin conexiones aún</h2>
            <p className="text-party-gray">
              Explora más perfiles y haz match para ver tus conexiones aquí
            </p>
          </div>
        )}
      </main>
      
      <Footer />
    </div>
  );
};

export default MatchesPage;
