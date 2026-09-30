import { Platform } from 'react-native';
import { extractTextFromImage, isSupported } from 'expo-text-extractor';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

/**
 * Reading text off a photo, on the phone: Google's ML Kit on Android, Apple's
 * Vision on iPhone. Nothing is uploaded — a receipt never leaves the device.
 */
export const ocrSupported = Platform.OS !== 'web' && isSupported;

/** The recogniser's text blocks for an image, top to bottom. */
export async function readText(uri: string): Promise<string[]> {
  if (!ocrSupported) return [];
  // The Android side takes a file path or a content:// URI, not a file:// URL.
  const path = uri.startsWith('file://') ? decodeURI(uri.slice('file://'.length)) : uri;
  return extractTextFromImage(path);
}

/**
 * A receipt photo made ready to read and to keep: turned if asked, no wider
 * than the text needs to stay sharp, saved as a JPEG.
 */
export async function prepareReceipt(
  uri: string,
  width: number,
  rotate = 0
): Promise<{ uri: string; width: number; height: number }> {
  let context = ImageManipulator.manipulate(uri);
  if (rotate) context = context.rotate(rotate);
  // After a quarter turn the long side is the other one; either way 1800
  // points across is ample for small receipt print.
  if (width > 1800) context = context.resize({ width: 1800 });
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ compress: 0.82, format: SaveFormat.JPEG });
  return { uri: saved.uri, width: saved.width, height: saved.height };
}
