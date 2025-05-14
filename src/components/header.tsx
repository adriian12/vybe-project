
import { Link } from "react-router-dom";
import { MessageCircle, User } from "lucide-react";
import logo from "/lovable-uploads/4d4819ce-4617-44e3-ab63-2a72565c3bbc.png";

const Header = () => {
  return (
    <header className="fixed top-0 left-0 right-0 z-20 h-16 flex items-center justify-between px-4 bg-background/80 backdrop-blur-md border-b border-border">
      <Link to="/profile">
        <User size={24} className="text-party-primary" />
      </Link>
      <Link to="/" className="text-xl font-bold">
        <img src={logo} alt="Vybe" className="h-8" />
      </Link>
      <Link to="/matches">
        <MessageCircle size={24} className="text-party-primary" />
      </Link>
    </header>
  );
};

export default Header;
