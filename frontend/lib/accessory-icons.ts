import type { SVGProps } from 'react';
import {
  IconAntenna,
  IconAshtray,
  IconBolt,
  IconBook,
  IconClipboard,
  IconClock,
  IconDisc,
  IconJack,
  IconKey,
  IconLayers,
  IconMirror,
  IconRadio,
  IconSpark,
  IconTire,
  IconWiper,
  IconWrench,
} from '@/components/icons';

type IconCmp = (p: SVGProps<SVGSVGElement>) => React.ReactElement;

/** Se evalúa en orden: lo más específico primero ("tapa de llanta" antes que "llanta"). */
const RULES: [RegExp, IconCmp][] = [
  [/espejo/, IconMirror],
  [/antena/, IconAntenna],
  [/radio/, IconRadio],
  [/reloj/, IconClock],
  [/encendedor/, IconSpark],
  [/cenicero/, IconAshtray],
  [/piso/, IconLayers],
  [/plumilla|limpiaparabrisas/, IconWiper],
  [/tapa/, IconDisc],
  [/llanta|neumatico|rueda/, IconTire],
  [/gata/, IconJack],
  [/herramienta/, IconWrench],
  [/llave/, IconKey],
  [/catalogo|manual/, IconBook],
  [/relay|rele/, IconBolt],
];

const ACCENTS: Record<string, string> = {
  á: 'a',
  é: 'e',
  í: 'i',
  ó: 'o',
  ú: 'u',
  ü: 'u',
  ñ: 'n',
};

/** "Catálogos" y "Catalogos" deben empatar con la misma regla. */
function normalize(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[áéíóúüñ]/g, (c) => ACCENTS[c] ?? c);
}

export function accessoryIcon(name: string): IconCmp {
  const n = normalize(name);
  for (const [re, Icon] of RULES) {
    if (re.test(n)) return Icon;
  }
  return IconClipboard;
}
