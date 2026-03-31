// =============================================================================
// Employee App -- Biometric Authentication Wrapper
// =============================================================================

import * as LocalAuthentication from "expo-local-authentication";

export type BiometricType = "face" | "fingerprint" | "iris" | "none";

/**
 * Map expo-local-authentication AuthenticationType enum to our string type.
 * AuthenticationType: 1 = FINGERPRINT, 2 = FACIAL_RECOGNITION, 3 = IRIS
 */
function mapAuthType(types: LocalAuthentication.AuthenticationType[]): BiometricType {
  if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) return "face";
  if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) return "fingerprint";
  if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) return "iris";
  return "none";
}

/**
 * Check whether the device supports biometric auth and has enrolled biometrics.
 * Never throws -- returns { available: false, type: "none" } on any error.
 */
export async function checkBiometricAvailability(): Promise<{
  available: boolean;
  type: BiometricType;
}> {
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    if (!hasHardware) return { available: false, type: "none" };

    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    if (!isEnrolled) return { available: false, type: "none" };

    const supported = await LocalAuthentication.supportedAuthenticationTypesAsync();
    const type = mapAuthType(supported);

    return { available: type !== "none", type };
  } catch {
    return { available: false, type: "none" };
  }
}

/**
 * Trigger biometric authentication prompt.
 * Returns true on success, false on failure/cancel. Never throws.
 */
export async function authenticateWithBiometric(
  promptMessage: string,
  options?: { allowDeviceFallback?: boolean; cancelLabel?: string },
): Promise<boolean> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel: options?.cancelLabel,
      fallbackLabel: options?.cancelLabel,
      // In standalone build: true = require actual biometric (Face ID / fingerprint)
      // In Expo Go: Face ID not available, falls back to device passcode regardless
      disableDeviceFallback: !(options?.allowDeviceFallback ?? false),
    });
    return result.success;
  } catch {
    return false;
  }
}
