
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useAppContext } from '@/context/app-context';
import { PartyButton } from '../ui-custom/party-button';
import { Calendar } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { Event } from '@/types/venue';

interface EventFormData {
  name: string;
  startDate: string;
  endDate: string;
  minAge?: number;
  maxAge?: number;
  theme?: string;
  dressCode?: string;
  price?: number;
  bookingUrl?: string;
}

const CreateEventForm = () => {
  const { currentVenue, createEvent } = useAppContext();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  
  const { register, handleSubmit, formState: { errors }, reset } = useForm<EventFormData>();
  
  if (!currentVenue) {
    return <div>No tienes permiso para crear eventos</div>;
  }
  
  const onSubmit = async (data: EventFormData) => {
    setIsLoading(true);
    
    try {
      // Convert price from string to number
      const price = data.price ? parseFloat(data.price.toString()) : undefined;
      
      // Convert minAge and maxAge from string to number
      const minAge = data.minAge ? parseInt(data.minAge.toString()) : undefined;
      const maxAge = data.maxAge ? parseInt(data.maxAge.toString()) : undefined;
      
      const eventData: Omit<Event, 'id'> = {
        name: data.name,
        venueId: currentVenue.id,
        startDate: new Date(data.startDate).toISOString(),
        endDate: new Date(data.endDate).toISOString(),
        minAge,
        maxAge,
        theme: data.theme,
        dressCode: data.dressCode,
        price,
        bookingUrl: data.bookingUrl
      };
      
      const newEvent = await createEvent(eventData);
      
      if (newEvent) {
        reset();
        toast({
          title: 'Evento creado',
          description: 'Tu evento ha sido creado correctamente',
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
        
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="minAge" className="block text-sm font-medium mb-1">Edad mínima</label>
            <input
              id="minAge"
              type="number"
              min="0"
              {...register('minAge')}
              className="w-full bg-party-dark/20 border border-party-dark/30 rounded-lg px-4 py-2"
              placeholder="18"
            />
          </div>
          
          <div>
            <label htmlFor="maxAge" className="block text-sm font-medium mb-1">Edad máxima</label>
            <input
              id="maxAge"
              type="number"
              min="0"
              {...register('maxAge')}
              className="w-full bg-party-dark/20 border border-party-dark/30 rounded-lg px-4 py-2"
              placeholder="99"
            />
          </div>
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
        
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="price" className="block text-sm font-medium mb-1">Precio (€)</label>
            <input
              id="price"
              type="number"
              step="0.01"
              min="0"
              {...register('price')}
              className="w-full bg-party-dark/20 border border-party-dark/30 rounded-lg px-4 py-2"
              placeholder="15.00"
            />
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
