
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { seedProfiles, seedEvents } from './services/seed-service'

// Inicializamos los datos de prueba
seedProfiles().then(() => {
  return seedEvents();
}).catch(error => {
  console.error("Error inicializando datos de prueba:", error);
}).finally(() => {
  // Iniciamos la aplicación
  createRoot(document.getElementById("root")!).render(<App />);
});
