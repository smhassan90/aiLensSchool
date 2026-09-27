import React from 'react';
import Svg, { Path } from 'react-native-svg';

export type ImageAssetProps = {
  size?: number;
  color?: string;
};

type IconRenderer = (props: ImageAssetProps) => React.JSX.Element;

function strokeIcon(
  d: string | string[],
  opts?: { fill?: boolean },
): IconRenderer {
  return ({ size = 24, color = '#1d2530' }: ImageAssetProps) => {
    const paths = Array.isArray(d) ? d : [d];
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        {paths.map((pathD, i) => (
          <Path
            key={i}
            d={pathD}
            stroke={color}
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill={opts?.fill ? color : 'none'}
          />
        ))}
      </Svg>
    );
  };
}

/** Cross-platform SVG icons (no font / vector-icon fonts). */
export class imagesAssets {
  static home = strokeIcon('M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z');

  static book = strokeIcon([
    'M5 4h9a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2V4Z',
    'M7 4v14a2 2 0 0 0 2 2h9',
  ]);

  static document = strokeIcon([
    'M8 3h6l4 4v14a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z',
    'M14 3v5h5',
    'M9 13h6M9 17h6',
  ]);

  static helpCircle = strokeIcon([
    'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z',
    'M9.5 9.25A2.5 2.5 0 1 1 12 12v1',
    'M12 17h.01',
  ]);

  static person = strokeIcon([
    'M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z',
    'M5 20a7 7 0 0 1 14 0',
  ]);

  static school = strokeIcon([
    'M3 10.5 12 5l9 5.5-9 5.5-9-5.5Z',
    'M6 12v5.5c0 .5 2.7 1.5 6 1.5s6-1 6-1.5V12',
    'M20 10.5V16',
  ]);

  static chevronForward = strokeIcon('M9 6l6 6-6 6');

  static chevronDown = strokeIcon('M6 9l6 6 6-6');

  static arrowForward = strokeIcon('M5 12h12M13 7l5 5-5 5');

  static analytics = strokeIcon([
    'M4 19V5',
    'M4 19h16',
    'M8 15V9M12 17v-4M16 13V7',
  ]);

  static pencil = strokeIcon([
    'M4 20h4l10-10-4-4L4 16v4Z',
    'M14 6l4 4',
  ]);

  static megaphone = strokeIcon([
    'M4 10v4a2 2 0 0 0 2 2h1l5 4V6L7 10H6a2 2 0 0 0-2 2Z',
    'M16 8.5a4 4 0 0 1 0 7',
  ]);

  static calendar = strokeIcon([
    'M7 3v2M17 3v2',
    'M4 8h16',
    'M6 6h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z',
  ]);

  static wallet = strokeIcon([
    'M4 8h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z',
    'M3 9V7a2 2 0 0 1 2-2h14',
    'M17 14h.01',
  ]);

  static bell = strokeIcon([
    'M12 4a4 4 0 0 0-4 4v3l-2 3h12l-2-3V8a4 4 0 0 0-4-4Z',
    'M10 20a2 2 0 0 0 4 0',
  ]);

  static ribbon = strokeIcon([
    'M8 4h8l2 4-6 3-6-3 2-4Z',
    'M8 11v9l4-2 4 2v-9',
  ]);

  static bulb = strokeIcon([
    'M9 18h6',
    'M10 22h4',
    'M12 3a6 6 0 0 0-3 11v2h6v-2a6 6 0 0 0-3-11Z',
  ]);

}
