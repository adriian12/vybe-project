
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useAppContext } from '@/context/app-context';
import { PartyButton } from '../ui-custom/party-button';
import { Calendar } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { Event, VenueType } from '@/types/venue';

interface PriceItem {
  description: string;
  amount: number;
}

interface EventFormData {
  name: string;
  startDate: string;
  endDate: string;
  minAge?: number;
  theme?: string;
  dressCode?: string;
  prices?: PriceItem[];
  bookingUrl?: string;
}

const CreateEventForm = () => {
  const { currentVenue, createEvent } = useAppContext();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [prices, setPrices] = useState<PriceItem[]>([{ description: '', amount: 0 }]);
  
  const { register, handleSubmit, formState: { errors }, reset } = useForm<EventFormData>();
  
  if (!currentVenue) {
    return <div>No tienes permiso para crear eventos</div>;
  }
  
  const addPriceField = () => {
    setPrices([...prices, { description: '', amount: 0 }]);
  };

  const removePriceField = (index: number) => {
    const newPrices = [...prices];
    newPrices.splice(index, 1);
    setPrices(newPrices);
  };

  const updatePriceField = (index: number, field: 'description' | 'amount', value: string | number) => {
    const newPrices = [...prices];
    if (field === 'description') {
      newPrices[index].description = value as string;
    } else {
      newPrices[index].amount = value as number;
    }
    setPrices(newPrices);
  };
  
  const onSubmit = async (data: EventFormData) => {
    setIsLoading(true);
    
    try {
      // Use the first price from the array as the main price
      const price = prices.length > 0 ? prices[0].amount : undefined;
      
      // Convert minAge from string to number
      const minAge = data.minAge ? parseInt(data.minAge.toString()) : 18; // Default to 18
      
      // Prepare description from all prices
      const priceDescription = prices.length > 1 ? 
        prices.map(p => `${p.description}: ${p.amount}€`).join(', ') : 
        undefined;
      
      const eventData: Omit<Event, 'id'> = {
        name: data.name,
        venueId: currentVenue.id,
        startDate: new Date(data.startDate).toISOString(),
        endDate: new Date(data.endDate).toISOString(),
        minAge,
        theme: data.theme,
        dressCode: data.dressCode,
        price: price,
        bookingUrl: data.bookingUrl,
        description: priceDescription
      };
      
      const newEvent = await createEvent(eventData);
      
      if (newEvent) {
        reset();
        setPrices([{ description: '', amount: 0 }]);
        toast({
          title: 'Evento creado',
          description: 'Tu evento ha sido creado correctamente. El QR se generará automáticamente 10 minutos antes del inicio.',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudo crear el evento',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-6">Crear nuevo evento</h2>
      
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label htmlFor="name" className="block text-sm font-medium mb-1">Nombre del evento *</label>
          <input
            id="name"
            type="text"
            {...register('name', { required: 'Este campo es obligatorio' })}
            className="w-full bg-party-dark/20 border border-party-dark/30 rounded-lg px-4 py-2"
            placeholder="Fiesta de verano"
          />
          {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="startDate" className="block text-sm font-medium mb-1">Fecha de inicio *</label>
            <div className="relative">
              <input
                id="startDate"
                type="datetime-local"
                {...register('startDate', { required: 'Este campo es obligatorio' })}
                className="w-full bg-party-dark/20 border border-party-dark/30 rounded-lg px-4 py-2"
              />
              <Calendar size={16} className="absolute top-3 right-3 text-party-gray" />
            </div>
            {errors.startDate && <p className="text-red-500 text-xs mt-1">{errors.startDate.message}</p>}
          </div>
          
          <div>
            <label htmlFor="endDate" className="block text-sm font-medium mb-1">Fecha de fin *</label>
            <div className="relative">
              <input
                id="endDate"
                type="datetime-local"
                {...register('endDate', { required: 'Este campo es obligatorio' })}
                className="w-full bg-party-dark/20 border border-party-dark/30 rounded-lg px-4 py-2"
              />
              <Calendar size={16} className="absolute top-3 right-3 text-party-gray" />
            </div>
            {errors.endDate && <p className="text-red-500 text-xs mt-1">{errors.endDate.message}</p>}
          </div>
        </div>
        
        <div>
          <label htmlFor="minAge" className="block text-sm font-medium mb-1">Edad mínima</label>
          <input
            id="minAge"
            type="number"
            min="0"
            defaultValue={18}
            {...register('minAge')}
            className="w-full bg-party-dark/20 border border-party-dark/30 rounded-lg px-4 py-2"
            placeholder="18"
          />
          <p className="text-xs text-party-gray mt-1">Por defecto +18</p>
        </div>
        
        <div>
          <label htmlFor="theme" className="block text-sm font-medium mb-1">Temática</label>
          <input
            id="theme"
            type="text"
            {...register('theme')}
            className="w-full bg-party-dark/20 border border-party-dark/30 rounded-lg px-4 py-2"
            placeholder="Electrónica, Reggaeton, Pop..."
          />
        </div>
        
        <div>
          <label htmlFor="dressCode" className="block text-sm font-medium mb-1">Código de vestimenta</label>
          <input
            id="dressCode"
            type="text"
            {...register('dressCode')}
            className="w-full bg-party-dark/20 border border-party-dark/30 rounded-lg px-4 py-2"
            placeholder="Casual elegante, Todo blanco..."
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium mb-1">Precios (€)</label>
          
          {prices.map((price, index) => (
            <div key={index} className="flex space-x-2 mb-2">
              <input
                type="text"
                value={price.description}
                onChange={(e) => updatePriceField(index, 'description', e.target.value)}
                className="flex-1 bg-party-dark/20 border border-party-dark/30 rounded-lg px-4 py-2"
                placeholder="Descripción (ej: Entrada General)"
              />
              <input
                type="number"
                step="0.01"
                min="0"
                value={price.amount}
                onChange={(e) => updatePriceField(index, 'amount', parseFloat(e.target.value))}
                className="w-24 bg-party-dark/20 border border-party-dark/30 rounded-lg px-4 py-2"
                placeholder="€"
              />
              {prices.length > 1 && (
                <button 
                  type="button" 
                  onClick={() => removePriceField(index)}
                  className="px-2 py-1 bg-red-500 text-white rounded-lg"
                >
                  -
                </button>
              )}
            </div>
          ))}
          
          <button 
            type="button" 
            onClick={addPriceField}
            className="mt-1 text-sm text-party-primary"
          >
            + Añadir otro precio
          </button>
        </div>
        
        <div>
          <label htmlFor="bookingUrl" className="block text-sm font-medium mb-1">URL de reserva</label>
          <input
            id="bookingUrl"
            type="url"
            {...register('bookingUrl')}
            className="w-full bg-party-dark/20 border border-party-dark/30 rounded-lg px-4 py-2"
            placeholder="https://..."
          />
        </div>
        
        <div className="pt-4">
          <PartyButton type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? 'Creando evento...' : 'Crear evento'}
          </PartyButton>
        </div>
      </form>
    </div>
  );
};

export default CreateEventForm;
