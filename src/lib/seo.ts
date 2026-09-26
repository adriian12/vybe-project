/**
 * Título, descripción y URL canónica de la página abierta. La web es una sola
 * página (SPA), así que cada pantalla pública los cambia al abrirse: sin esto
 * todas decían lo mismo que la portada y Google no indexaba los textos legales.
 */
export const setSeo = ({ title, description, path }: { title: string; description?: string; path: string }) => {
  document.title = title;
  const meta = (selector: string, attr: 'content' | 'href', value: string) => {
    const el = document.head.querySelector(selector);
    if (el) el.setAttribute(attr, value);
  };
  const url = `https://fiestea.es${path}`;
  if (description) {
    meta('meta[name="description"]', 'content', description);
    meta('meta[property="og:description"]', 'content', description);
  }
  meta('meta[property="og:title"]', 'content', title);
  meta('meta[property="og:url"]', 'content', url);
  meta('link[rel="canonical"]', 'href', url);
};
