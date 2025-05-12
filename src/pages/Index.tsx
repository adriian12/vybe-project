
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAppContext } from "@/context/app-context";

const Index = () => {
  const { isLoggedIn, isLocationVerified, isEventVerified } = useAppContext();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoggedIn) {
      navigate("/auth");
    } else if (!isLocationVerified || !isEventVerified) {
      navigate("/location");
    } else {
      navigate("/home");
    }
  }, [isLoggedIn, isLocationVerified, isEventVerified, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-pulse-soft">
        <div className="text-3xl font-bold text-transparent bg-clip-text party-gradient">
          Vybe
        </div>
      </div>
    </div>
  );
};

export default Index;
