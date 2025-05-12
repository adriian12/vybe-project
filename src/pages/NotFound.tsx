
import { Link } from "react-router-dom";
import { PartyButton } from "@/components/ui-custom/party-button";

const NotFound = () => {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="text-center">
        <div className="text-7xl mb-4">🎭</div>
        <h1 className="text-3xl font-bold mb-2">Página no encontrada</h1>
        <p className="text-party-gray mb-6">
          Parece que la fiesta que buscas no está aquí
        </p>
        <Link to="/">
          <PartyButton variant="gradient">Volver a la fiesta</PartyButton>
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
