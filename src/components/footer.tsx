
import { Link } from "react-router-dom";
import { Heart, MapPin, Users } from "lucide-react";

const Footer = () => {
  return (
    <footer className="fixed bottom-0 left-0 right-0 z-20 h-16 flex items-center justify-around px-4 bg-background/80 backdrop-blur-md border-t border-border">
      <Link to="/" className="flex flex-col items-center text-xs">
        <Heart
          size={24}
          className="text-party-primary mb-1"
          fill="currentColor"
        />
        <span>Descubrir</span>
      </Link>
      
      <Link to="/location" className="flex flex-col items-center text-xs">
        <MapPin size={24} className="text-party-gray mb-1" />
        <span>Eventos</span>
      </Link>
      
      <Link to="/matches" className="flex flex-col items-center text-xs">
        <Users size={24} className="text-party-gray mb-1" />
        <span>Matches</span>
      </Link>
    </footer>
  );
};

export default Footer;
