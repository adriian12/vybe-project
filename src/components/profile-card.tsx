
import React, { useState } from "react";
import { User } from "@/types/user";
import { X, Check, MapPin, Star, Crown } from "lucide-react";
import { PartyButton } from "./ui-custom/party-button";

interface ProfileCardProps {
  user: User;
  onSwipeLeft: (userId: string) => void;
  onSwipeRight: (userId: string) => void;
  onSuperLike?: (userId: string) => void;
  isPremium?: boolean;
}

const ProfileCard: React.FC<ProfileCardProps> = ({
  user,
  onSwipeLeft,
  onSwipeRight,
  onSuperLike,
  isPremium = false,
}) => {
  const [swipeDirection, setSwipeDirection] = useState<'left' | 'right' | 'up' | null>(null);

  const handleSwipeLeft = () => {
    setSwipeDirection('left');
    setTimeout(() => {
      onSwipeLeft(user.id);
      setSwipeDirection(null);
    }, 300);
  };

  const handleSwipeRight = () => {
    setSwipeDirection('right');
    setTimeout(() => {
      onSwipeRight(user.id);
      setSwipeDirection(null);
    }, 300);
  };

  const handleSuperLike = () => {
    if (!onSuperLike) return;
    
    setSwipeDirection('up');
    setTimeout(() => {
      onSuperLike(user.id);
      setSwipeDirection(null);
    }, 300);
  };

  const cardClass = swipeDirection === 'left' 
    ? 'swiping-left' 
    : swipeDirection === 'right' 
    ? 'swiping-right' 
    : swipeDirection === 'up'
    ? 'swiping-up'
    : '';

  return (
    <div className={`profile-card relative w-full h-[70vh] max-w-sm mx-auto rounded-xl overflow-hidden shadow-lg ${cardClass}`}>
      <div className="profile-card-inner w-full h-full">
        <div
          className="w-full h-full bg-cover bg-center relative"
          style={{ backgroundImage: `url(${user.photos[0]})` }}
        >
          <div className="absolute inset-0 card-gradient flex flex-col justify-end p-4">
            <h3 className="text-2xl font-bold text-white">{user.name}, {user.age}</h3>
            <div className="flex items-center text-white/80 mb-2">
              <MapPin size={16} className="mr-1" />
              <span>{user.distance}m</span>
            </div>
            <p className="text-white/90 text-sm mb-4">{user.bio}</p>
            
            <div className="flex justify-between mt-2">
              <PartyButton 
                variant="default" 
                size="round"
                className="shadow-lg" 
                onClick={handleSwipeLeft}
              >
                <X size={24} />
              </PartyButton>

              {isPremium && onSuperLike && (
                <PartyButton 
                  variant="accent" 
                  size="round" 
                  className="shadow-lg"
                  onClick={handleSuperLike}
                >
                  <Star size={24} />
                </PartyButton>
              )}
              
              <PartyButton 
                variant="accent" 
                size="round" 
                className="shadow-lg"
                onClick={handleSwipeRight}
              >
                <Check size={24} />
              </PartyButton>
            </div>

            {!isPremium && (
              <div className="mt-4">
                <button className="w-full py-1 px-2 bg-party-accent/30 backdrop-blur-sm rounded-lg text-white text-xs flex items-center justify-center">
                  <Crown size={12} className="mr-1" />
                  Desbloquea Super Likes con Vybe Premium
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfileCard;
