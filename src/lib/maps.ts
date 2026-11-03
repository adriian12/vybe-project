/**
 * Enlace de «Cómo llegar» (Google Maps, con la ruta desde donde estés).
 *
 * Con dirección escrita se manda el texto (sala + dirección + ciudad), no las
 * coordenadas: Google encuentra «Sonido Alicante, Calle Mayor 16» mucho mejor
 * que los geocodificadores gratuitos de los que salen nuestras coordenadas, y
 * algunas fiestas importadas tenían el punto en un aeropuerto o en un callejón.
 * Sin dirección, las coordenadas.
 */
export const rutaHasta = (sitio: {
  name?: string | null;
  address?: string | null;
  city?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}): string | null => {
  const base = 'https://www.google.com/maps/dir/?api=1&destination=';
  const direccion = sitio.address?.trim();
  if (direccion) {
    const minus = direccion.toLowerCase();
    const partes = [
      sitio.name?.trim() && !minus.includes(sitio.name.trim().toLowerCase()) ? sitio.name.trim() : null,
      direccion,
      sitio.city?.trim() && !minus.includes(sitio.city.trim().toLowerCase()) ? sitio.city.trim() : null,
    ].filter(Boolean);
    return base + encodeURIComponent(partes.join(', '));
  }
  if (typeof sitio.latitude === 'number' && typeof sitio.longitude === 'number') {
    return `${base}${sitio.latitude},${sitio.longitude}`;
  }
  return null;
};
