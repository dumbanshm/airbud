// Airbud's icon set: 24px grid, 1.6 stroke, round caps and joins. The plane is the one filled glyph
// (Material "flight", Apache 2.0).
import Svg, { Circle, Path } from 'react-native-svg';

export const PLANE_PATH = 'M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z';

const PATHS = {
  back: ['M15 5l-7 7 7 7'],
  chevron: ['M6 9l6 6 6-6'],
  share: ['M12 15V3', 'M7.5 7.5L12 3l4.5 4.5', 'M5 12v7.5h14V12'],
  clock: ['M12 7v5l3 2'],
  check: ['M8 12.5l2.8 2.7L16.2 9.6'],
  bell: ['M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z', 'M10 20.5a2 2 0 0 0 4 0'],
  face: ['M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8', 'M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8', 'M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16', 'M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16', 'M9 10v1', 'M15 10v1', 'M12 10v3h-1', 'M9.5 15.5c1.5 1 3.5 1 5 0'],
  doc: ['M6 3h8l4 4v14H6z', 'M14 3v4h4'],
  gear: ['M12 2.8v2.4', 'M12 18.8v2.4', 'M21.2 12h-2.4', 'M5.2 12H2.8', 'M18.5 5.5l-1.7 1.7', 'M7.2 16.8l-1.7 1.7', 'M18.5 18.5l-1.7-1.7', 'M7.2 7.2L5.5 5.5'],
  calendar: ['M4 6.5h16v13H4z', 'M4 10.5h16', 'M8.5 4v4', 'M15.5 4v4'],
  arrow: ['M4 12h15', 'M13 6l6 6-6 6'],
  close: ['M6 6l12 12', 'M18 6L6 18'],
  mail: ['M3.5 6h17v12h-17z', 'M4 6.5l8 6 8-6'],
} as const;

/** Icons drawn around a circle. */
const RINGED = new Set(['clock', 'check']);
const CENTERED = { gear: 3 } as const;

export type IconName = keyof typeof PATHS | 'plane';

export function Icon({ name, size = 20, color, rotate = 0 }: { name: IconName; size?: number; color: string; rotate?: number }) {
  if (name === 'plane') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" style={{ transform: [{ rotate: `${rotate}deg` }] }}>
        <Path d={PLANE_PATH} fill={color} />
      </Svg>
    );
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"
      style={rotate ? { transform: [{ rotate: `${rotate}deg` }] } : undefined}>
      {RINGED.has(name) ? <Circle cx={12} cy={12} r={9} /> : null}
      {name in CENTERED ? <Circle cx={12} cy={12} r={CENTERED[name as keyof typeof CENTERED]} /> : null}
      {PATHS[name].map((d) => <Path key={d} d={d} />)}
    </Svg>
  );
}
