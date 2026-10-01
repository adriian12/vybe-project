/**
 * Descarga una tabla como CSV para Excel en español: separador `;`, BOM para
 * que respete los acentos y fin de línea de Windows.
 *
 * Las celdas que empiezan por `=`, `+`, `-` o `@` se escapan con un apóstrofo:
 * un nombre o un correo escrito por quien compra no puede convertirse en una
 * fórmula al abrir el fichero (inyección de CSV).
 */
const celda = (valor: unknown): string => {
  let texto = valor === null || valor === undefined ? '' : String(valor);
  if (/^[=+\-@\t\r]/.test(texto)) texto = `'${texto}`;
  return `"${texto.replace(/"/g, '""')}"`;
};

export const toCsv = (filas: unknown[][]): string => filas.map((fila) => fila.map(celda).join(';')).join('\r\n');

/** Nombre de fichero seguro a partir de un texto («Aurora Sessions» → «aurora-sessions»). */
export const slugFichero = (texto: string): string =>
  texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) || 'export';

export const downloadCsv = (nombre: string, filas: unknown[][]): void => {
  const url = URL.createObjectURL(new Blob(['﻿' + toCsv(filas)], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre.endsWith('.csv') ? nombre : `${nombre}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
