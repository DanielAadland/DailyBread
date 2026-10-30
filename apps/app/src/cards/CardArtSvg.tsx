import type { CardBackground } from '@bible-app/core';
import { useId } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { ART_H, ART_W, CARD_ART } from './backgrounds';

/**
 * A card background drawn with SVG. Fills its parent: stretched to the card's 4:5 box, or with
 * `cover`, cropped from the top so the landscape stays at the bottom of any shape.
 * `aspect` (width / height of the box) lets wide boxes show more landscape instead of enlarging it.
 */
export function CardArtSvg({ background, cover = false, aspect }: { background: CardBackground; cover?: boolean; aspect?: number }) {
  const art = CARD_ART[background];
  // Wider than the 4:5 card: show more of the landscape at the same scale instead of enlarging it.
  const wide = cover && aspect !== undefined && aspect > ART_W / ART_H;
  const viewWidth = wide ? ART_H * aspect! : ART_W;
  const viewBox = `${(ART_W - viewWidth) / 2} 0 ${viewWidth} ${ART_H}`;
  const id = `sky-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg
        width="100%"
        height="100%"
        viewBox={viewBox}
        preserveAspectRatio={wide ? 'xMidYMax meet' : cover ? 'xMidYMax slice' : 'none'}
        aria-hidden
        focusable={false}
      >
        {art.layers.map((layer, i) => {
          switch (layer.kind) {
            case 'sky':
              return [
                <Defs key={`d${i}`}>
                  <LinearGradient id={id} x1="0" y1="0" x2="0" y2={ART_H} gradientUnits="userSpaceOnUse">
                    {layer.stops.map(([offset, color]) => (
                      <Stop key={offset} offset={offset} stopColor={color} />
                    ))}
                  </LinearGradient>
                </Defs>,
                <Rect key={`r${i}`} x={-3000} y={0} width={7000} height={ART_H} fill={`url(#${id})`} />,
              ];
            case 'circle':
              return <Circle key={i} cx={layer.cx} cy={layer.cy} r={layer.r} fill={layer.fill} opacity={layer.opacity ?? 1} />;
            case 'shape':
              return <Path key={i} d={layer.d} fill={layer.fill} opacity={layer.opacity ?? 1} />;
            case 'line':
              return (
                <Path key={i} d={layer.d} fill="none" stroke={layer.stroke} strokeWidth={layer.width} strokeLinecap="round" opacity={layer.opacity ?? 1} />
              );
          }
        })}
      </Svg>
    </View>
  );
}
