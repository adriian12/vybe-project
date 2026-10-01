/**
 * Validación de NIF, NIE y CIF españoles.
 *
 * El alta de un local pedía «documentación que acredite la titularidad» y la
 * marcaba como opcional, así que en la práctica no se comprobaba nada. Un PDF
 * tampoco prueba mucho: se falsifica en cinco minutos. El identificador fiscal
 * sí se puede contrastar contra un registro público, y hace falta igualmente
 * para facturar el plan.
 *
 * Aquí sólo se comprueba el dígito de control, que es lo que se puede hacer sin
 * salir del navegador: descarta lo inventado al azar, no confirma que ese NIF
 * sea de quien lo escribe. Eso lo sigue haciendo administración a mano antes de
 * aprobar el local.
 */

/** Las letras del DNI, en el orden en que las asigna el resto de dividir por 23. */
const LETRAS_DNI = 'TRWAGMYFPDXBNJZSQVHLCKE';

/** Las letras que puede llevar el dígito de control de un CIF. */
const LETRAS_CIF = 'JABCDEFGHI';

/** Quita espacios, guiones y puntos, y pasa a mayúsculas. */
export const normalizeNif = (value: string): string =>
  value.toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Dígito de control de un CIF, a partir de sus siete cifras. */
const controlCif = (digits: string): number => {
  let suma = 0;

  digits.split('').forEach((caracter, indice) => {
    const digito = Number(caracter);

    // Las posiciones impares (1.ª, 3.ª, 5.ª y 7.ª) se duplican y se suman las
    // cifras del resultado; las pares se suman tal cual.
    if (indice % 2 === 0) {
      const doble = digito * 2;
      suma += doble > 9 ? doble - 9 : doble;
    } else {
      suma += digito;
    }
  });

  return (10 - (suma % 10)) % 10;
};

export const isValidNif = (value: string): boolean => {
  const nif = normalizeNif(value);
  if (nif.length !== 9) return false;

  // DNI: ocho cifras y una letra.
  if (/^\d{8}[A-Z]$/.test(nif)) {
    return nif[8] === LETRAS_DNI[Number(nif.slice(0, 8)) % 23];
  }

  // NIE: X, Y o Z en lugar de la primera cifra (0, 1 y 2 respectivamente).
  if (/^[XYZ]\d{7}[A-Z]$/.test(nif)) {
    const numero = Number(`${'XYZ'.indexOf(nif[0])}${nif.slice(1, 8)}`);
    return nif[8] === LETRAS_DNI[numero % 23];
  }

  // CIF: letra de tipo de entidad, siete cifras y control.
  if (/^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/.test(nif)) {
    const control = controlCif(nif.slice(1, 8));
    const esperadoLetra = LETRAS_CIF[control];
    const esperadoNumero = String(control);
    const dado = nif[8];

    // Según el tipo de entidad el control es letra, número, o cualquiera de
    // los dos: las sociedades extranjeras y las corporaciones locales llevan
    // letra, las anónimas y limitadas número, y el resto admite ambos.
    if ('PQRSNW'.includes(nif[0])) return dado === esperadoLetra;
    if ('ABEH'.includes(nif[0])) return dado === esperadoNumero;
    return dado === esperadoNumero || dado === esperadoLetra;
  }

  return false;
};
