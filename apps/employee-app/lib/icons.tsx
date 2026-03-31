// =============================================================================
// Employee App -- Shared Icon Component (Ionicons)
// SSOT for all icons in the app. Zero emoji.
// =============================================================================

import Ionicons from "@expo/vector-icons/Ionicons";

export type IconName = React.ComponentProps<typeof Ionicons>["name"];

interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  accessible?: boolean;
}

export function Icon({ name, size = 24, color = "#FFFFFF", accessible = false }: IconProps) {
  return (
    <Ionicons
      name={name}
      size={size}
      color={color}
      accessible={accessible}
    />
  );
}
