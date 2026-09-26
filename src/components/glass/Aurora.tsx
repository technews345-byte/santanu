import React, { createContext, RefObject } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';

/**
 * The view every glass pane on a screen blurs. Android's blur needs to be
 * pointed at the content it blurs, and that content is the room below.
 */
export const BlurTargetContext = createContext<RefObject<View | null> | null>(null);

const ROOM = {
  dark: require('../../../assets/room-dark.webp'),
  light: require('../../../assets/room-light.webp'),
};

/**
 * Luminous objects in a dark room, for the glass to float in front of.
 *
 * Glass only reads as glass when there is something behind it with edges:
 * outside a pane these spheres are crisp, and through it they soften into
 * glowing colour. So the room holds three vivid, solid spheres — violet high
 * on the right behind the balance, a small warm one tucked at the left edge,
 * cyan low on the right — each lit from the upper-left and spilling a soft
 * glow of its own colour into the dark.
 *
 * The room never changes, so it is a picture rather than a drawing: every
 * screen shares one decoded image instead of each painting full-screen
 * gradients as it opens, which is what made moving between screens stutter.
 */
export function Aurora() {
  const { theme } = useTheme();
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.bg }]} pointerEvents="none">
      <Image
        source={theme.mode === 'dark' ? ROOM.dark : ROOM.light}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
        fadeDuration={0}
      />
    </View>
  );
}
